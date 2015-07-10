'use strict';

/*
	make this read-only except by the creator
*/
function TimeRanges(parent) {
	[
		'start',
		'end'
	].forEach((key) => {
		this[key] = parent[key].bind(parent);
	});

	Object.defineProperty(this, 'length', {
		configurable: false,
		enumerable: true,
		get: function () {
			return parent.length;
		}
	});
}

function TimeRangesPriveleged() {
	this.ranges = [];

	Object.defineProperty(this, 'length', {
		configurable: false,
		enumerable: true,
		get: () => {
			return this.ranges.length || 1;
		}
	});

	this.pub = new TimeRanges(this);
}

TimeRangesPriveleged.prototype.add = function (start, end) {
	//todo: optimize with binary search
	var startIndex,
		endIndex,
		startObj,
		endObj,
		ranges = this.ranges;

	if (start >= end) {
		//todo: throw error?
		return;
	}

	if (!ranges.length) {
		ranges.push({
			start: start,
			end: end
		});
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

	if (startObj.end >= start && startObj.start < end) {
		startObj.end = Math.max(end, startObj.end);
	} else if (endObj.start <= end && endObj.end > start) {
		endObj.start = Math.min(start, endObj.start);
	} else {
		ranges.splice(endIndex, 0, {
			start: start,
			end: end
		});
		return;
	}

	//merge if ranges overlap
	while (startIndex < endIndex) {
		if (startObj.end >= endObj.start) {
			startObj.end = Math.max(startObj.end, endObj.end);
			ranges.splice(startIndex, 1);
		}
		startObj = ranges[startIndex];
		startIndex++;
	}
};

TimeRangesPriveleged.prototype.subtract = function (start, end) {
	//todo: optimize with binary search
	var i,
		range,
		newRange,
		ranges = this.ranges;

	if (start >= end) {
		//todo: throw error?
		return;
	}

	for (i = ranges.length - 1; i >= 0; i--) {
		range = ranges[i];

		if (range.start >= end) {
			//we've past any useful ranges, so stop
			break;
		}

		if (range.end > start) {
			if (range.start < start && range.end > end) {
				// splice ranges that completely cover start-end
				newRange = {
					start: end,
					end: range.end
				};
				range.end = start;
				if (newRange.end > newRange.start) {
					ranges.splice(i + 1, 0, newRange);
				}

			// trim ranges that overlap
			} else {
				if (end >= range.end) {
					range.end = start;
				} else if (start <= range.start) {
					range.start = end;
				}
			}

			// delete empty ranges
			if (range.start >= range.end) {
				ranges.splice(i, 1);
			}
		}
	}
};

TimeRangesPriveleged.prototype.reset = function (amount) {
	var ranges = this.ranges;
	if (ranges.length) {
		ranges.length = 1;
		ranges[0].start = 0;
		ranges[0].end = amount || 0;
	} else {
		ranges.push({
			start: 0,
			end: amount || 0
		});
	}
};

TimeRangesPriveleged.prototype.copy = function (src) {
	var ranges = this.ranges,
		length = src.length,
		range,
		i;
	ranges.length = length;
	for (i = 0; i < length; i++) {
		range = ranges[i];
		if (!range) {
			range = ranges[i] = {};
		}
		range.start = src.start(i);
		range.end = src.end(i);
	}
};

TimeRangesPriveleged.prototype.start = function (i) {
	var ranges = this.ranges;

	if (!i && !ranges.length) {
		return 0;
	}

	if (i >= 0 && i < ranges.length) {
		return ranges[i].start;
	}

	//todo: throw DOMException/INDEX_SIZE_ERR
};

TimeRangesPriveleged.prototype.end = function (i) {
	var ranges = this.ranges;

	if (!i && !ranges.length) {
		return 0;
	}

	if (i >= 0 && i < ranges.length) {
		return ranges[i].end;
	}

	//todo: throw DOMException/INDEX_SIZE_ERR
};


/*
tests for TimeRanges
todo: move these out into a separate file
var ranges = new TimeRangesPriveleged();
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

ranges.reset();
ranges.add(1, 10);
ranges.subtract(0.5, 2);
ranges.subtract(9, 12);

ranges.reset(10);
ranges.subtract(4, 5);
ranges.subtract(4.8, 12);
*/

export default TimeRangesPriveleged;
