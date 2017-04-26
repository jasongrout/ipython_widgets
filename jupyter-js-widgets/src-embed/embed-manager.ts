// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ManagerBase
} from '../lib/manager-base';

import * as PhosphorWidget from '@phosphor/widgets';

export
class EmbedManager extends ManagerBase<HTMLElement> {

    /**
     * Display the specified view. Element where the view is displayed
     * is specified in the `options` argument.
     */
    display_view(msg, view, options) {
        return Promise.resolve(view).then(function(view) {
            PhosphorWidget.Widget.attach(view.pWidget, options.el);
            view.on('remove', function() {
                console.log('View removed', view);
            });
            return view;
        });
    };

    /**
     * Placeholder implementation for _get_comm_info.
     */
    _get_comm_info() {
        return Promise.resolve({});
    };

    /**
     * Placeholder implementation for _create_comm.
     */
    _create_comm() {
        return Promise.resolve({
            on_close: () => {},
            on_msg: () => {},
            close: () => {}
        });
    };

    /**
     * Load a class and return a promise to the loaded object.
     */
    protected loadClass(options) {
        let packageName = options.package || options.module;
        let packageVersion = options.packageVersion || '*';
        return new Promise(function(resolve, reject) {
            (window as any).require([`https://unpkg.com/${packageName}@${packageVersion}/dist/index.js`], resolve, reject);
        }).then(function(module) {
            if (module[options.class] === undefined) {
                throw new Error('Class ' + options.class + ' not found in module ' + packageName);
            } else {
                return module[options.class];
            }
        });
    }
};
