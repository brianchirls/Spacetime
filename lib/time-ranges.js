/*
	todo: come up with some creative way to make this read-only
	except by the creator
*/
module.exports = function TimeRanges() {
	'use strict';

	var ranges = [
		{
			start: 0,
			end: 0
		}
	];

	Object.defineProperty(this, 'length', {
		configurable: false,
		enumerable: true,
		get: function () {
			return ranges.length;
		}
	});

	this.add = function (start, end) {
		//todo: optimize with binary search
		var startIndex,
			endIndex,
			startObj,
			endObj;

		if (start >= end) {
			//todo: throw error?
			return;
		}

		startObj = ranges[0];
		for (startIndex = 0; startIndex < ranges.length; startIndex++) {
			if (ranges[startIndex].start > start) {
				break;
			}
			startObj = ranges[startIndex];
		}

		endObj = startObj;
		for (endIndex = startIndex; endIndex < ranges.length; endIndex++) {
			if (ranges[endIndex].start > end) {
				break;
			}
			endObj = ranges[endIndex];
		}

		if (startObj.end >= start) {
			startObj.end = end;
		} else if (endObj.start <= end && endObj.end > start) {
			endObj.start = start;
		} else {
			ranges.splice(endIndex, 0, {
				start: start,
				end: end
			});
			return;
		}

		//merge if ranges overlap
		/*
		todo: this is totally busted. fix it
		*/
		while (startIndex < endIndex) {
			ranges.splice(startIndex, endIndex - startIndex);
		}
	};

	this.start = function (i) {
		if (i >=0 && i < ranges.length) {
			return ranges[i].start;
		}

		//todo: throw DOMException/INDEX_SIZE_ERR
	};

	this.end = function (i) {
		if (i >=0 && i < ranges.length) {
			return ranges[i].end;
		}

		//todo: throw DOMException/INDEX_SIZE_ERR
	};
};

/*
tests for TimeRanges
todo: move these out into a separate file
var ranges = new TimeRanges();
ranges.add(0, 2);
console.log(ranges.length, ranges.start(0), ranges.end(0));

ranges.add(5, 6);
console.log(ranges.length, ranges.start(1), ranges.end(1));

ranges.add(3, 4);
console.log(ranges.length, ranges.start(1), ranges.end(1));
console.log(ranges.length, ranges.start(2), ranges.end(2));

ranges.add(2, 3);
console.log(ranges.length, ranges.start(1), ranges.end(1));

ranges.add(0, 9);
console.log(ranges.length, ranges.start(0), ranges.end(0));
*/
