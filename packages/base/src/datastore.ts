// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ICallbacks
} from './services-shim';

export
interface ISetOptions {
    callbacks: ICallbacks;
    options: any;
}

export
type EventListener<STATE, VALUE> = (store: IDataStore<STATE>, values: VALUE) => void;

export
type WidgetManagerStore = {
  [key: string]: IDataStore<any>;
};

/**
 * Data store class: a key-value store of attributes for the model.
 * 
 * - ideally, can provide typed change notifications
 * - a change notification can involve multiple attributes
 * - set/get should be typed as well
 * - 
 * 
 * - State: a key/value dictionary
 * - get/set uses Partial<State>. Should be async for state stores?
 * - event should just dispatch on a change, and you get the current state from the store when needed?
 * 
 * Backwards compatibility:
 * - events: 'change' or 'change:attribute'
 * - get()
 * - set()
 * 
 * - set defaults attributes from the class
 * - get() an attribute
 * - set() an attribute
 * 
 */
export
interface IDataStore<STATE> {
    get<T extends keyof STATE>(k: T): STATE[T];


    // The promise resolves when the value is synced to the kernel if connected? Or just set in the state store?
    set(v: Partial<STATE>, options: ISetOptions): Promise<void>;
    // for convenience and backwards compatibility, we allow setting a single setting. Should we allow this?
    // set<T extends keyof STATE>(k: T, v: STATE[T], options: ISetOptions): Promise<void>;

    /**
     * Should the set automatically sync? Or should there be a separate sync
     * call? Here are a couple of scenarios
     * - Peer widgets sets that don't call sync
     * - calling set as part of a change notification, then sync at the very end. For example, validation of a set value.
     */

    // Whether the store is currently connected to the kernel
    connected: boolean;

    // Some signal for when the connected status changes
    addStateChangeListener(f: EventListener<STATE, Partial<STATE>>, thisContext?: any): void;
    removeStateChangeListener(f: EventListener<STATE, Partial<STATE>>, thisContext?: any): void;

    addConnectedChangeListener(f: EventListener<STATE, Partial<STATE>>, thisContext?: any): void;
    removeConnectedChangeListener(f: EventListener<STATE, Partial<STATE>>, thisContext?: any): void;

    /**
     * We can no longer send messages directly. In order to support messages
     * and batch syncing, we really should support a queue field, where, say,
     * frontends can append messages, and the kernel takes them off the queue.
     * Nice thing about a queue field is that all frontends using this store
     * will see any message any other frontend sends.
     *
     * For buttons, state can be collapsed by incrementing the click counter
     * and possibly a last-clicked timestamp?
     */
    /**
     * Custom messages useful?
     * 
     * - streaming video from Maarten's camera widget
     * - lightweight mouse/focus events (ipyevent)
     * - RPC from kernel to js
     */
    send(): void;

    // On receiving a custom message, trigger a backbone event?

    // All serialization logic moves into this data store layer. We have to
    // figure out how to tie up a single instance's access with the
    // appropriate serialization. Perhaps the widget, when it registers for
    // space, it registers its serialization functions for each field.


    // on comm close: dispose event


  /**
   * Easiest way to preserve the current api is to make sync do a datastore
   * set. Keep most all of the logic already in the widget class.
   */
  }
