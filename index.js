(function(undefined) {

    var DEF_JPEG_QUALITY = 100,
        DEF_INTERPOLATION = 'lanczos',
        DEF_ROTATE_COLOR = 'gray';

    var path = require('path'),
        async = require('async'),
        lwip = require('./build/Release/lwip');

    var openers = [{
        exts: ['jpg', 'jpeg'],
        opener: lwip.openJpeg
    }, {
        exts: ['png'],
        opener: lwip.openPng
    }];

    var interpolations = {
        'nearest-neighbor': 1,
        'moving-average': 2,
        'linear': 3,
        'grid': 4,
        'cubic': 5,
        'lanczos': 6
    };

    var colors = {
        'black': {
            r: 0,
            g: 0,
            b: 0
        },
        'white': {
            r: 255,
            g: 255,
            b: 255
        },
        'red': {
            r: 255,
            g: 0,
            b: 0
        },
        'blue': {
            r: 0,
            g: 0,
            b: 255
        },
        'green': {
            r: 0,
            g: 255,
            b: 0
        },
        'cyan': {
            r: 0,
            g: 255,
            b: 255
        },
        'yellow': {
            r: 255,
            g: 255,
            b: 0
        },
        'gray': {
            r: 128,
            g: 128,
            b: 128
        },
        'magenta': {
            r: 255,
            g: 0,
            b: 255
        }
    };

    function noop() {}

    function image(lwipImage) {
        this.__lwip = lwipImage;
    }

    image.prototype.width = function() {
        return this.__lwip.width();
    }

    image.prototype.height = function() {
        return this.__lwip.height();
    }

    image.prototype.size = function() {
        return {
            width: this.__lwip.width(),
            height: this.__lwip.height()
        };
    }

    image.prototype.scale = function(wRatio, hRatio, inter, callback) {
        var args = normalizeScaleArgs(wRatio, hRatio, inter, callback),
            width = +args.wRatio * this.width(),
            height = +args.hRatio * this.height(),
            that = this;
        this.__lwip.resize(width, height, interpolations[args.inter], function(err) {
            args.callback(err, that);
        });
    }

    image.prototype.resize = function(width, height, inter, callback) {
        var args = normalizeResizeArgs(width, height, inter, callback),
            that = this;
        this.__lwip.resize(+args.width, +args.height, interpolations[args.inter], function(err) {
            args.callback(err, that);
        });
    }

    image.prototype.rotate = function(degs, color, callback) {
        var args = normalizeRotateArgs(degs, color, callback),
            that = this;
        this.__lwip.rotate(+args.degs, +args.color.r, +args.color.g, +args.color.b, function(err) {
            args.callback(err, that);
        });
    }

    image.prototype.toBuffer = function(type, params, callback) {
        var args = normalizeToBufferArgs(type, params, callback);
        if (args.type === 'jpg' || args.type === 'jpeg') {
            args.params.quality = args.params.quality || DEF_JPEG_QUALITY;
            if (args.params.quality != parseInt(args.params.quality) || args.params.quality < 0 || args.params.quality > 100)
                return setImmediate(function() {
                    args.callback('Invalid JPEG quality');
                });
            return this.__lwip.toJpegBuffer(args.params.quality, args.callback);
        } else setImmediate(function() {
            args.callback('Unknown type \'' + args.type + '\'');
        });
    }

    image.prototype.batch = function() {
        return new batch(this);
    }

    function batch(image) {
        this.__image = image;
        this.__queue = [];
        this.__running = false;
        this.__addOp = function(handle, args) {
            this.__queue.push({
                handle: handle,
                args: args
            });
        };
    }

    batch.prototype.exec = function(callback) {
        var that = this;
        if (that.__running) throw Error("Batch is already running");
        that.__running = true;
        async.eachSeries(this.__queue, function(op, done) {
            op.args.push(done);
            op.handle.apply(that.__image, op.args);
        }, function(err) {
            that.__queue.length = 0; // queue is now empty
            that.__running = false;
            callback(err, that.__image);
        });
    }

    batch.prototype.scale = function(wRatio, hRatio, inter) {
        var args = normalizeScaleArgs(wRatio, hRatio, inter, noop);
        args = [args.wRatio, args.hRatio, args.inter];
        this.__addOp(this.__image.scale, args);
        return this;
    }

    batch.prototype.resize = function(width, height, inter) {
        var args = normalizeResizeArgs(width, height, inter, noop);
        args = [args.width, args.height, args.inter];
        this.__addOp(this.__image.resize, args);
        return this;
    }

    batch.prototype.rotate = function(degs, color) {
        var args = normalizeRotateArgs(degs, color, noop);
        args = [args.degs, args.color];
        this.__addOp(this.__image.rotate, args);
        return this;
    }

    batch.prototype.toBuffer = function(type, params, callback) {
        var args = normalizeToBufferArgs(type, params, callback),
            that = this;
        this.exec(function(err, image) {
            if (err) return callback(err, image);
            image.toBuffer(args.type, args.params, args.callback);
        });
    }

    function normalizeScaleArgs(wRatio, hRatio, inter, callback) {
        if (!wRatio || isNaN(wRatio) || wRatio <= 0)
            throw new TypeError('\'wRatio\' argument must be a positive number');
        callback = callback || inter || hRatio;
        if (typeof callback !== 'function')
            throw new TypeError('\'callback\' argument must be a function');
        if (typeof hRatio === 'function') inter = hRatio = undefined;
        else if (typeof inter === 'function') inter = undefined;
        inter = inter || DEF_INTERPOLATION;
        hRatio = hRatio || wRatio;
        if (!hRatio || isNaN(hRatio) || hRatio <= 0)
            throw new TypeError('\'hRatio\' argument must be a positive number');
        if (!interpolations[inter])
            throw new TypeError('\'inter\' argument must be a valid interpolation string');
        return {
            wRatio: wRatio,
            hRatio: hRatio,
            inter: inter,
            callback: callback
        };
    }

    function normalizeResizeArgs(width, height, inter, callback) {
        if (!width || isNaN(width) || width <= 0)
            throw new TypeError('\'width\' argument must be a positive number');
        callback = callback || inter || height;
        if (typeof callback !== 'function')
            throw new TypeError('\'callback\' argument must be a function');
        if (typeof height === 'function') inter = height = undefined;
        else if (typeof inter === 'function') inter = undefined;
        inter = inter || DEF_INTERPOLATION;
        height = height || width;
        if (!height || isNaN(height) || height <= 0)
            throw new TypeError('\'height\' argument must be a positive number');
        if (!interpolations[inter])
            throw new TypeError('\'inter\' argument must be a valid interpolation string');
        return {
            width: width,
            height: height,
            inter: inter,
            callback: callback
        };
    }

    function normalizeRotateArgs(degs, color, callback) {
        if ((!degs && degs != 0) || isNaN(degs))
            throw new TypeError('\'degs\' argument must be a number');
        callback = callback || color;
        if (typeof callback !== 'function')
            throw new TypeError('\'callback\' argument must be a function');
        if (typeof color === 'function') color = DEF_ROTATE_COLOR;
        if (typeof color === 'string') {
            if (colors[color]) color = colors[color];
            else throw new TypeError('\'color\' argument is invalid');
        } else {
            if (color instanceof Array) {
                color = {
                    r: color[0],
                    g: color[1],
                    b: color[2]
                };
            }
            if (color.r != parseInt(color.r) || color.r < 0 || color.r > 255)
                throw new TypeError('\'red\' color component is invalid');
            if (color.g != parseInt(color.g) || color.g < 0 || color.g > 255)
                throw new TypeError('\'green\' color component is invalid');
            if (color.b != parseInt(color.b) || color.b < 0 || color.b > 255)
                throw new TypeError('\'blue\' color component is invalid');
        }
        return {
            degs: degs,
            color: color,
            callback: callback
        };
    }

    function normalizeToBufferArgs(type, params, callback) {
        if (typeof type !== 'string')
            throw new TypeError('\'type\' argument must be a string');
        type = type.toLowerCase();
        callback = callback || params;
        params = params && typeof params === 'object' ? params : typeof params === 'function' ? {} : undefined;
        if (typeof params !== 'object')
            throw new TypeError('\'params\' argument must be an object');
        if (typeof callback !== 'function')
            throw new TypeError('\'callback\' argument must be a function');
        return {
            type: type,
            params: params,
            callback: callback
        };
    }

    function open(impath, type, callback) {
        if (typeof impath !== 'string')
            throw new TypeError('\'path\' argument must be a string');
        callback = callback || type;
        type = typeof type === 'string' ? type : typeof type === 'function' ? path.extname(impath).slice(1) : undefined;
        if (typeof type !== 'string')
            throw new TypeError('\'type\' argument must be a string');
        if (typeof callback !== 'function')
            throw new TypeError('\'callback\' argument must be a function');

        getOpener(type)(impath, function(err, lwipImage) {
            callback(err, err ? undefined : new image(lwipImage));
        });
    }

    function getOpener(ext) {
        for (var i = 0; i < openers.length; i++) {
            var opener = openers[i].opener,
                exts = openers[i].exts;
            if (exts.indexOf(ext) !== -1) return opener;
        }
        return function(impath, callback) {
            setImmediate(function() {
                callback('Unknown type \'' + ext + '\'');
            });
        }
    }

    // EXPORTS
    // -------
    module.exports = {
        open: open
    };
})(void 0);