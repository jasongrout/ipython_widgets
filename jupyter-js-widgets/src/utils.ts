// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as _ from 'underscore';

// TODO: ATTEMPT TO KILL THIS MODULE USING THIRD PARTY LIBRARIES WHEN IPYWIDGETS
// IS CONVERTED TO NODE COMMONJS.

/**
 * http://www.ietf.org/rfc/rfc4122.txt
 */
export
function uuid(): string {
    var s = [];
    var hexDigits = '0123456789ABCDEF';
    for (var i = 0; i < 32; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[12] = '4';  // bits 12-15 of the time_hi_and_version field to 0010
    s[16] = hexDigits.substr((s[16] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01

    return s.join('');
}

/**
 * Wrappable Error class
 *
 * The Error class doesn't actually act on `this`.  Instead it always
 * returns a new instance of Error.  Here we capture that instance so we
 * can apply it's properties to `this`.
 */
export
class WrappedError extends Error {
    constructor(message, error) {
        super(message);
        // Keep a stack of the original error messages.
        if (error instanceof WrappedError) {
            this.error_stack = error.error_stack;
        } else {
            this.error_stack = [error];
        }
        this.error_stack.push(this);
    }
    error_stack: any[];
}

/**
 * Resolve a promiseful dictionary.
 * Returns a single Promise.
 */
export
function resolvePromisesDict(d): Promise<any> {
    var keys = Object.keys(d);
    var values = [];
    keys.forEach(function(key) {
        values.push(d[key]);
    });
    return Promise.all(values).then(function(v) {
        d = {};
        for(var i=0; i<keys.length; i++) {
            d[keys[i]] = v[i];
        }
        return d;
    });
}

/**
 * Creates a wrappable Promise rejection function.
 *
 * Creates a function that returns a Promise.reject with a new WrappedError
 * that has the provided message and wraps the original error that
 * caused the promise to reject.
 */
export
function reject(message, log) {
    return function promiseRejection(error) {
        var wrapped_error = new WrappedError(message, error);
        if (log) console.error(wrapped_error);
        return Promise.reject(wrapped_error);
    };
}


/**
 * Apply MathJax rendering to an element, and optionally set its text.
 *
 * If MathJax is not available, make no changes.
 *
 * Parameters
 * ----------
 * element: Node
 * text: optional string
 */
export
function typeset(element: HTMLElement, text?: string): void {
    if (text !== void 0) {
        element.textContent = text;
    }
    if ((window as any).MathJax !== void 0) {
        MathJax.Hub.Queue(['Typeset', MathJax.Hub, element]);
    }
}


/**
 * escape text to HTML
 */
export
function escape_html(text: string): string {
    var esc  = document.createElement('div');
    esc.textContent = text;
    return esc.innerHTML;
};

/**
 * Takes an object 'state' and fills in buffer[i] at 'path' buffer_paths[i]
 * where buffer_paths[i] is a list indicating where in the object buffer[i] should
 * be placed
 * Example: state = {a: 1, b: {}, c: [0, null]}
 * buffers = [array1, array2]
 * buffer_paths = [['b', 'data'], ['c', 1]]
 * Will lead to {a: 1, b: {data: array1}, c: [0, array2]}
 */
export
function put_buffers(state, buffer_paths, buffers) {
    for (let i=0; i<buffer_paths.length; i++) {
        let buffer_path = buffer_paths[i];
         // say we want to set state[x][y][z] = buffers[i]
        let obj = state;
        // we first get obj = state[x][y]
        for (let j = 0; j < buffer_path.length-1; j++)
            obj = obj[buffer_path[j]];
        // and then set: obj[z] = buffers[i]
        obj[buffer_path[buffer_path.length-1]] = buffers[i];
    }
}

/**
 * The inverse of put_buffers, return an objects with the new state where all buffers(ArrayBuffer)
 * are removed. If a buffer is a member of an object, that object is cloned, and the key removed. If a buffer
 * is an element of an array, that array is cloned, and the element is set to null.
 * See put_buffers for the meaning of buffer_paths
 * Returns an object with the new state (.state) an array with paths to the buffers (.buffer_paths),
 * and the buffers associated to those paths (.buffers).
 */
export
function remove_buffers(state) {
    let buffers = [];
    let buffer_paths = [];
    // if we need to remove an object from a list, we need to clone that list, otherwise we may modify
    // the internal state of the widget model
    // however, we do not want to clone everything, for performance
    function remove(obj, path) {
        if (obj.toJSON) {
            // We need to get the JSON form of the object before recursing.
            // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#toJSON()_behavior
            obj = obj.toJSON();
        }
        if (Array.isArray(obj)) {
            let is_cloned = false;
            for (let i = 0; i < obj.length; i++) {
                let value = obj[i];
                if(value) {
                    if (value.buffer instanceof ArrayBuffer || value instanceof ArrayBuffer) {
                        if(!is_cloned) {
                            obj = _.clone(obj);
                            is_cloned = true;
                        }
                        buffers.push(value);
                        buffer_paths.push(path.concat([i]));
                        // easier to just keep the array, but clear the entry, otherwise we have to think
                        // about array length, much easier this way
                        obj[i] = null;
                    } else {
                        let new_value  = remove(value, path.concat([i]));
                        // only assigned when the value changes, we may serialize objects that don't support assignment
                        if(new_value !== value) {
                            if(!is_cloned) {
                                obj = _.clone(obj);
                                is_cloned = true;
                            }
                            obj[i] = new_value;
                        }
                    }
                }
            }
        } else if(_.isObject(obj)) {
            for (let key in obj) {
                let is_cloned = false;
                if (obj.hasOwnProperty(key)) {
                    let value = obj[key];
                    if(value) {
                        if (value.buffer instanceof ArrayBuffer || value instanceof ArrayBuffer) {
                            if(!is_cloned) {
                                obj = _.clone(obj);
                                is_cloned = true;
                            }
                            buffers.push(value);
                            buffer_paths.push(path.concat([key]));
                            delete obj[key]; // for objects/dicts we just delete them
                        }
                        else {
                            let new_value  = remove(value, path.concat([key]));
                            // only assigned when the value changes, we may serialize objects that don't support assignment
                            if(new_value !== value) {
                                if(!is_cloned) {
                                    obj = _.clone(obj);
                                    is_cloned = true;
                                }
                                obj[key] = new_value;
                            }
                        }
                    }
                }
            }
        }
        return obj;
    }
    let new_state = remove(state, []);
    return {state: new_state, buffers: buffers, buffer_paths: buffer_paths}
}
