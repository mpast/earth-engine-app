'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const filename of ['src/js/maps.js', 'static/js/maps.js']) {
    test(`${filename} builds modern Earth Engine tile URLs`, () => {
        let overlay;
        const map = { overlayMapTypes: { push(value) { overlay = value; } } };
        const context = {
            sessionStorage: { getItem() { return null; } },
            document: { getElementById() { return {}; } },
            google: { maps: {
                LatLng: function () {}, Map: function () { return map; },
                Size: function () {}, ImageMapType: function (options) { return options; }
            } },
            $: function () {}
        };
        context.$.fn = {};
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
        const format = '/tiles/projects/test/maps/test/{z}/{x}/{y}';
        assert.equal(context.createMap('id', '', format), map);
        assert.equal(overlay.getTileUrl({ x: 12, y: 34 }, 5), format.replace('{z}', '5').replace('{x}', '12').replace('{y}', '34'));
    });
}
