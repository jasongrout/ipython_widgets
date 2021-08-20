// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import * as nbformat from '@jupyterlab/nbformat';

import {
  IConsoleTracker,
  CodeConsole,
  ConsolePanel,
} from '@jupyterlab/console';

import {
  INotebookTracker,
  Notebook,
  NotebookPanel,
} from '@jupyterlab/notebook';

import {
  JupyterFrontEndPlugin,
  JupyterFrontEnd,
} from '@jupyterlab/application';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ILoggerRegistry, LogLevel } from '@jupyterlab/logconsole';

import { CodeCell } from '@jupyterlab/cells';

import { toArray, filter } from '@lumino/algorithm';

import { DisposableDelegate } from '@lumino/disposable';

import { WidgetRenderer } from './renderer';

import {
  WidgetManager,
  WIDGET_VIEW_MIMETYPE,
  KernelWidgetManager,
} from './manager';

import { OutputModel, OutputView, OUTPUT_WIDGET_VERSION } from './output';

import * as base from '@jupyter-widgets/base';

// We import only the version from the specific module in controls so that the
// controls code can be split and dynamically loaded in webpack.
import { JUPYTER_CONTROLS_VERSION } from '@jupyter-widgets/controls/lib/version';

import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets-base.css';
import { KernelMessage } from '@jupyterlab/services';
import { ISessionContext } from '@jupyterlab/apputils';
const WIDGET_REGISTRY: base.IWidgetRegistryData[] = [];

/**
 * The cached settings.
 */
const SETTINGS: WidgetManager.Settings = { saveState: false };

/**
 * Iterate through all widget renderers in a notebook.
 */
function* notebookWidgetRenderers(
  nb: Notebook
): Generator<WidgetRenderer, void, unknown> {
  for (const cell of nb.widgets) {
    if (cell.model.type === 'code') {
      for (const codecell of (cell as CodeCell).outputArea.widgets) {
        for (const output of toArray(codecell.children())) {
          if (output instanceof WidgetRenderer) {
            yield output;
          }
        }
      }
    }
  }
}

/**
 * Iterate through all widget renderers in a console.
 */
function* consoleWidgetRenderers(
  console: CodeConsole
): Generator<WidgetRenderer, void, unknown> {
  for (const cell of toArray(console.cells)) {
    if (cell.model.type === 'code') {
      for (const codecell of (cell as unknown as CodeCell).outputArea.widgets) {
        for (const output of toArray(codecell.children())) {
          if (output instanceof WidgetRenderer) {
            yield output;
          }
        }
      }
    }
  }
}

/**
 * Iterate through all matching linked output views
 */
function* outputViews(
  app: JupyterFrontEnd,
  path: string
): Generator<WidgetRenderer, void, unknown> {
  const linkedViews = filter(
    app.shell.widgets(),
    (w) => w.id.startsWith('LinkedOutputView-') && (w as any).path === path
  );
  for (const view of toArray(linkedViews)) {
    for (const outputs of toArray(view.children())) {
      for (const output of toArray(outputs.children())) {
        if (output instanceof WidgetRenderer) {
          yield output;
        }
      }
    }
  }
}

function* chain<T>(
  ...args: IterableIterator<T>[]
): Generator<T, void, undefined> {
  for (const it of args) {
    yield* it;
  }
}

/**
 * Get the kernel id of current notebook or console panel, this value
 * is used as key for `Private.widgetManagerProperty` to store the widget
 * manager of current notebook or console panel.
 *
 * @param {ISessionContext} sessionContext The session context of notebook or
 * console panel.
 */
async function getWidgetManagerOwner(
  sessionContext: ISessionContext
): Promise<Private.IWidgetManagerOwner> {
  await sessionContext.ready;
  return sessionContext.session?.kernel?.id;
}

// The manager should be tied to the kernel id, so if we switch to a kernel id that is already being used, we pick up that manager
// The session context is tied to the renderers. On kernel change, it finds the right manager and assigns the renderers manager
// When will a manager be destroyed? When a kernel shuts down (or restarts?) 

// We have a kernel widget manager, used for things that don't have a notebook document, and we have a widget manager for those things that do have a widget document.

// Scenario 1: notebook switch to a kernel that already has a manager: use that manager without hooking up the notebook parts
// Scenario 2: notebook switches to kernel that does not have a manager: create a widget manager for the kernel and store it under the kernel id.
// Scenario 3: console switches to kernel that already has a manager: use that manager
// Scenario 4: console has kernel that does not have wm: create kernel widget manager

// Does a notebook insist on having a widget manager that understands notebooks?
// Who cleans up the widget managers? Do they destroy themselves 

// We cannot have two widget managers because they don't communicate values between each other, unless we broadcast comm messages between widget managers. Also it is pretty inefficient for large data sets (think large plot data)

// A notebook widget manager can change kernels, whereas a kernel widget manager can't. So we have a problem if we start a console kernel manager, then switch a notebook to use that kernel. We then have two different widget managers, or we have the notebook now having a kernel widget manager. We can't have two different widget managers, so how does a notebook deal with having a kernel widget manager?

// The console and notebook widget managers *could* delegate to a kernel widget manager, which could then be swapped out as needed.

// Fundamentally, the state storage should be tied to the kernel id. However, state loading and saving can also happen from a notebook document or some other source. So: have the widget state stored at the kernel level, i.e., have *just* a kernel widget manager, and the "widget manager" tied to a notebook context can swap out (or create) these kernel widget managers as needed. When a kernel dies, set the widget manager as dead?

/**
 * Common handler for registering both notebook and console
 * `WidgetManager`
 *
 * @param {(Notebook | CodeConsole)} content Context of panel.
 * @param {ISessionContext} sessionContext Session context of panel.
 * @param {IRenderMimeRegistry} rendermime Rendermime of panel.
 * @param {IterableIterator<WidgetRenderer>} renderers Iterator of
 * `WidgetRenderer` inside panel
 * @param {(() => WidgetManager | KernelWidgetManager)} widgetManagerFactory
 * function to create widget manager.
 */
async function registerWidgetHandler(
  content: Notebook | CodeConsole,
  sessionContext: ISessionContext,
  rendermime: IRenderMimeRegistry,
  renderers: IterableIterator<WidgetRenderer>,
  widgetManagerFactory: () => WidgetManager | KernelWidgetManager
): Promise<DisposableDelegate> {
  let currentOwner = await getWidgetManagerOwner(sessionContext);
  let wManager = Private.widgetManagerProperty.get(currentOwner);

  if (!wManager) {
    wManager = widgetManagerFactory();
    WIDGET_REGISTRY.forEach((data) => wManager!.register(data));
    Private.widgetManagerProperty.set(currentOwner, wManager);

    // If we created this widget manager, then we will be responsible for updating and destroying it. Other components that pick up this manager just go along.
    content.disposed.connect(() => {
      Private.widgetManagerProperty.delete(currentOwner);
      // Dispose the widget manager?
    });
    // Perhaps we should say that the sessioncontext disposal leads to deleting the widget manager?
    sessionContext.kernelChanged.connect((_, args) => {
      const { newValue } = args;
      if (newValue) {
        const newKernelId = newValue.id;
        const oldwManager = Private.widgetManagerProperty.get(currentOwner);
  
        if (oldwManager) {
          Private.widgetManagerProperty.delete(currentOwner);
          Private.widgetManagerProperty.set(newKernelId, oldwManager);
        }
        currentOwner = newKernelId;
      }
    });
  }


  for (const r of renderers) {
    r.manager = wManager;
  }

  // Replace the placeholder widget renderer with one bound to this widget
  // manager.
  rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
  rendermime.addFactory(
    {
      safe: false,
      mimeTypes: [WIDGET_VIEW_MIMETYPE],
      createRenderer: (options) => new WidgetRenderer(options, wManager),
    },
    0
  );

  // This disposableDelegate is not used by calling functions. Perhaps we should not return it, especially since it attempts to delete the widget manager, but above we have just the creator responsible for destroying the widget manager.
  return new DisposableDelegate(() => {
    if (rendermime) {
      rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
    }
    Private.widgetManagerProperty.delete(currentOwner);
    wManager!.dispose();
  });
}

export async function registerWidgetManager(
  panel: NotebookPanel,
  renderers: IterableIterator<WidgetRenderer>
): Promise<DisposableDelegate> {
  const content = panel.content;
  const context = panel.context;
  const sessionContext = context.sessionContext;
  const rendermime = content.rendermime;
  const widgetManagerFactory = () =>
    new WidgetManager(context, rendermime, SETTINGS);

  return registerWidgetHandler(
    content,
    sessionContext,
    rendermime,
    renderers,
    widgetManagerFactory
  );
}

export async function registerConsoleWidgetManager(
  panel: ConsolePanel,
  renderers: IterableIterator<WidgetRenderer>
): Promise<DisposableDelegate> {
  const content = panel.console;
  const sessionContext = content.sessionContext;
  const rendermime = content.rendermime;
  const widgetManagerFactory = () =>
    new KernelWidgetManager(sessionContext.session!.kernel!, rendermime);

  return registerWidgetHandler(
    content,
    sessionContext,
    rendermime,
    renderers,
    widgetManagerFactory
  );
}

/**
 * The widget manager provider.
 */
const plugin: JupyterFrontEndPlugin<base.IJupyterWidgetRegistry> = {
  id: '@jupyter-widgets/jupyterlab-manager:plugin',
  requires: [IRenderMimeRegistry],
  optional: [
    INotebookTracker,
    IConsoleTracker,
    ISettingRegistry,
    IMainMenu,
    ILoggerRegistry,
  ],
  provides: base.IJupyterWidgetRegistry,
  activate: activateWidgetExtension,
  autoStart: true,
};

export default plugin;

function updateSettings(settings: ISettingRegistry.ISettings): void {
  SETTINGS.saveState = settings.get('saveState').composite as boolean;
}

/**
 * Activate the widget extension.
 */
function activateWidgetExtension(
  app: JupyterFrontEnd,
  rendermime: IRenderMimeRegistry,
  tracker: INotebookTracker | null,
  consoleTracker: IConsoleTracker | null,
  settingRegistry: ISettingRegistry | null,
  menu: IMainMenu | null,
  loggerRegistry: ILoggerRegistry | null
): base.IJupyterWidgetRegistry {
  const { commands } = app;

  const bindUnhandledIOPubMessageSignal = async (
    nb: NotebookPanel
  ): Promise<void> => {
    if (!loggerRegistry) {
      return;
    }
    const wManagerOwner = await getWidgetManagerOwner(
      nb.context.sessionContext
    );
    const wManager = Private.widgetManagerProperty.get(wManagerOwner);

    if (wManager) {
      wManager.onUnhandledIOPubMessage.connect(
        (
          sender: WidgetManager | KernelWidgetManager,
          msg: KernelMessage.IIOPubMessage
        ) => {
          const logger = loggerRegistry.getLogger(nb.context.path);
          let level: LogLevel = 'warning';
          if (
            KernelMessage.isErrorMsg(msg) ||
            (KernelMessage.isStreamMsg(msg) && msg.content.name === 'stderr')
          ) {
            level = 'error';
          }
          const data: nbformat.IOutput = {
            ...msg.content,
            output_type: msg.header.msg_type,
          };
          logger.rendermime = nb.content.rendermime;
          logger.log({ type: 'output', data, level });
        }
      );
    }
  };
  if (settingRegistry !== null) {
    settingRegistry
      .load(plugin.id)
      .then((settings: ISettingRegistry.ISettings) => {
        settings.changed.connect(updateSettings);
        updateSettings(settings);
      })
      .catch((reason: Error) => {
        console.error(reason.message);
      });
  }

  // Add a placeholder widget renderer.
  rendermime.addFactory(
    {
      safe: false,
      mimeTypes: [WIDGET_VIEW_MIMETYPE],
      createRenderer: (options) => new WidgetRenderer(options),
    },
    0
  );

  if (tracker !== null) {
    const rendererIterator = (panel: NotebookPanel) =>
      chain(
        notebookWidgetRenderers(panel.content),
        outputViews(app, panel.context.path)
      );
    tracker.forEach(async (panel) => {
      await registerWidgetManager(panel, rendererIterator(panel));
      bindUnhandledIOPubMessageSignal(panel);
    });
    tracker.widgetAdded.connect(async (sender, panel) => {
      await registerWidgetManager(panel, rendererIterator(panel));
      bindUnhandledIOPubMessageSignal(panel);
    });
  }

  if (consoleTracker !== null) {
    const rendererIterator = (panel: ConsolePanel) =>
      chain(consoleWidgetRenderers(panel.console));

    consoleTracker.forEach(async (panel) => {
      await registerConsoleWidgetManager(panel, rendererIterator(panel));
    });
    consoleTracker.widgetAdded.connect(async (sender, panel) => {
      await registerConsoleWidgetManager(panel, rendererIterator(panel));
    });
  }
  if (settingRegistry !== null) {
    // Add a command for automatically saving (jupyter-)widget state.
    commands.addCommand('@jupyter-widgets/jupyterlab-manager:saveWidgetState', {
      label: 'Save Widget State Automatically',
      execute: (args) => {
        return settingRegistry
          .set(plugin.id, 'saveState', !SETTINGS.saveState)
          .catch((reason: Error) => {
            console.error(`Failed to set ${plugin.id}: ${reason.message}`);
          });
      },
      isToggled: () => SETTINGS.saveState,
    });
  }

  if (menu) {
    menu.settingsMenu.addGroup([
      { command: '@jupyter-widgets/jupyterlab-manager:saveWidgetState' },
    ]);
  }

  WIDGET_REGISTRY.push({
    name: '@jupyter-widgets/base',
    version: base.JUPYTER_WIDGETS_VERSION,
    exports: {
      WidgetModel: base.WidgetModel,
      WidgetView: base.WidgetView,
      DOMWidgetView: base.DOMWidgetView,
      DOMWidgetModel: base.DOMWidgetModel,
      LayoutModel: base.LayoutModel,
      LayoutView: base.LayoutView,
      StyleModel: base.StyleModel,
      StyleView: base.StyleView,
    },
  });

  WIDGET_REGISTRY.push({
    name: '@jupyter-widgets/controls',
    version: JUPYTER_CONTROLS_VERSION,
    exports: () => {
      return new Promise((resolve, reject) => {
        (require as any).ensure(
          ['@jupyter-widgets/controls'],
          (require: NodeRequire) => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            resolve(require('@jupyter-widgets/controls'));
          },
          (err: any) => {
            reject(err);
          },
          '@jupyter-widgets/controls'
        );
      });
    },
  });

  WIDGET_REGISTRY.push({
    name: '@jupyter-widgets/output',
    version: OUTPUT_WIDGET_VERSION,
    exports: { OutputModel, OutputView },
  });

  return {
    registerWidget(data: base.IWidgetRegistryData): void {
      WIDGET_REGISTRY.push(data);
    },
  };
}

namespace Private {
  /**
   * A type alias for keys of `widgetManagerProperty` .
   */
  export type IWidgetManagerOwner = string;

  /**
   * A type alias for values of `widgetManagerProperty` .
   */
  export type IWidgetManagerValue =
    | WidgetManager
    | KernelWidgetManager
    | undefined;

  /**
   * A private map for a widget manager.
   */
  export const widgetManagerProperty = new Map<
    IWidgetManagerOwner,
    IWidgetManagerValue
  >();
}
