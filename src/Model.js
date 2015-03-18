var falcor = require('./Falcor');
var Constants = require('./Constants');
var RequestQueue = require('./request/RequestQueue');
var Schedulers = require('./Scheduler');
var $TYPE = Constants.$TYPE;
var ERROR = Constants.$TYPE;
var modelOperations = require('./modelOperations');
var call = require('./call/call');

falcor.Model = Model;

Model.EXPIRES_NOW = falcor.EXPIRES_NOW;
Model.EXPIRES_NEVER = falcor.EXPIRES_NEVER;

function Model(options) {
    options || (options = {});
    this._dataSource = options.source;
    this._maxSize = options.maxSize || Math.pow(2, 53) - 1;
    this._collectRatio = options.collectRatio || 0.75;
    this._scheduler = new Schedulers.ImmediateScheduler();
    this._request = new RequestQueue(this, this._scheduler);
    this._errorSelector = options.errorSelector || Model.prototype._errorSelector;
    this._cache = {};
    this._router = options.router;
    this._root = options.root || {
        expired: [],
        allowSync: false,
        unsafeMode: true
    };
    if (options.cache && typeof options.cache === "object") {
        this.setCache(options.cache);
    }
    this._path = [];
}

Model.prototype = {
    _boxed: false,
    _progressive: false,
    _errorSelector: function(x, y) { return y; },
    get: modelOperation("get"),
    set: modelOperation("set"),
    invalidate: modelOperation("inv"),
    call: call,
    getValue: function(path) {
        return this.get(path, function(x) { return x });
    },
    setValue: function(path, value) {
        return this.set(Array.isArray(path) ?
        {path: path, value: value} :
            path, function(x) { return x; });
    },
    bind: function(boundPath) {

        var model = this, root = model._root,
            paths = new Array(arguments.length - 1),
            i = -1, n = arguments.length - 1;

        while(++i < n) {
            paths[i] = arguments[i + 1];
        }

        if(n === 0) { throw new Error("Model#bind requires at least one value path."); }

        return Rx.Observable.create(function(observer) {

            var boundModel;

            try {
                root.allowSync = true;
                if(!(boundModel = model.bindSync(model._path.concat(boundPath)))) {
                    throw false;
                }
                root.allowSync = false;
                observer.onNext(boundModel);
                observer.onCompleted();
            } catch (e) {
                root.allowSync = false;
                return model.get.apply(model, paths.map(function(path) {
                    return boundPath.concat(path);
                }).concat(function(){})).subscribe(
                    function onNext() {},
                    function onError(err)  { observer.onError(err); },
                    function onCompleted() {
                        try {
                            if(boundModel = model.bindSync(boundPath)) {
                                observer.onNext(boundModel);
                            }
                            observer.onCompleted();
                        } catch(e) {
                            observer.onError(e);
                        }
                    });
            }
        });
    },
    setCache: function(cache) {
        return this._setPathMapsAsValues(this, [cache], undefined, this._errorSelector, []);
    },
    getBoundValue: function() {
        return this.syncCheck("getBoundValue") && this._getBoundValue(this);
    },
    getBoundContext: function() {
        return this.syncCheck("getBoundContext") && this._getBoundContext(this);
    },
    getValueSync: function(path) {
        if(Array.isArray(path) === false) {
            throw new Error("Model#getValueSync must be called with an Array path.");
        }
        var value = this.syncCheck("getValueSync") && this._getValueSync(this, this._path.concat(path)).value;
        if(value[$TYPE] === ERROR) {
            throw value;
        }
        return value;
    },
    setValueSync: function(path, value, errorSelector) {
        if(Array.isArray(path) === false) {
            if(typeof errorSelector !== "function") {
                errorSelector = value || this._errorSelector;
            }
            value = path.value;
            path  = path.path;
        }
        if(Array.isArray(path) === false) {
            throw new Error("Model#setValueSync must be called with an Array path.");
        }
        if(this._dataSource) {
            throw new Error("Model#setValueSync can not be invoked on a Model with a DataSource. Please use the withoutDataSource() method followed by setValueSync if you would like to modify only the local cache.");
        }
        var value = this.syncCheck("setValueSync") && this._setValueSync(this, this._path.concat(path), value, errorSelector);
        if(value[$TYPE] === ERROR) {
            throw value;
        }
        return value;
    },
    bindSync: function(path) {
        if(Array.isArray(path) === false) {
            throw new Error("Model#bindSync must be called with an Array path.");
        }
        var boundValue = this.syncCheck("bindSync") && getBoundValue(this, this._path.concat(path));
        if(boundValue.shorted) {
            if(boundValue = boundValue.value) {
                if(boundValue[$TYPE] === ERROR) {
                    throw boundValue;
                    // throw new Error("Model#bindSync can\'t bind to or beyond an error: " + boundValue.toString());
                }
            }
            return undefined;
        } else if(boundValue.value && boundValue.value[$TYPE] === ERROR) {
            throw boundValue.value;
        }
        return this.clone(["_path", boundValue.path]);
    },
    // TODO: This seems like a great place for optimizations
    clone: function() {
        var self = this;
        var clone = new Model();

        Object.keys(self).forEach(function(key) {
            clone[key] = self[key];
        });

        Array.prototype.slice.call(arguments).forEach(function(tuple) {
            model[tuple[0]] = tuple[1];
        });

        return clone;
    },
    batch: function(schedulerOrDelay) {
        if(typeof schedulerOrDelay === "number") {
            schedulerOrDelay = new Schedulers.TimeoutScheduler(Math.round(Math.abs(schedulerOrDelay)));
        } else if(!schedulerOrDelay || !schedulerOrDelay.schedule) {
            schedulerOrDelay = new Schedulers.ImmediateScheduler();
        }
        return this.clone(["_request", new RequestQueue(this, schedulerOrDelay)]);
    },
    unbatch: function() {
        return this.clone(["_request", new RequestQueue(this, new Schedulers.ImmediateScheduler())]);
    },
    boxValues: function() {
        return this.clone(["_boxed", true]);
    },
    unboxValues: function() {
        return this.clone(["_boxed", false]);
    },
    withoutDataSource: function() {
        return this.clone(["_dataSource", null]);
    },
    syncCheck: function(name) {
        if(this._root.allowSync === false && this._root.unsafeMode === false) {
            throw new Error("Model#" + name + " may only be called within the context of a request selector.");
        }
        return true;
    }
};
model.exports = Model;
