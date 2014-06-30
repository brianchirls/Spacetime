/*jslint devel: true, bitwise: true, browser: true, white: true, nomen: true, plusplus: true, maxerr: 50, indent: 4, todo: true */
/*global define, require, exports */
(function (root, factory) {
	'use strict';

	//todo: load Q as a dependency

	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['spacetime'], factory);
	} else if (typeof exports === 'object') {
		factory(require('spacetime'));
	} else {
		// Browser globals
		factory(root.Spacetime);
	}
}(this, function (Spacetime, undefined) {
	'use strict';

	Spacetime.plugin('text', function (options) {
		var container = document.createElement('div');

		function setText(text) {
			var i;

			//todo: faster DOM diff?

			//clear out element just in case
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}

			text = (text || '').split(/[\n\r]/);
			for (i = 0; i < text.length; i++) {
				if (i) {
					container.appendChild(document.createElement('br'));
				}
				container.appendChild(document.createTextNode(text[i]));
			}
		}

		if (options.text) {
			setText(options.text);
		}

		return {
			element: container,
			modify: function (options, changes) {
				if (options.text !== changes.text) {
					setText(changes.text);
				}
			},
			activate: function () {
				//todo: add 'active' class
			},
			deactivate: function () {
				//todo: remove 'active' class
			}
			//todo: destroy?
			//todo: do we want to handle font loading? if so, make a `load` method
			//todo: load css styles?
		};
	});
}));