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

function TimeRangesInternal() {
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

TimeRangesInternal.prototype.add = function (start, end) {
	//todo: optimize with binary search
	var startIndex = -1,
		endIndex = -1,
		startObj,
		endObj,
		obj,
		ranges = this.ranges,
		i;

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

	//find object that overlaps with end
	for (i = 0; i < ranges.length; i++) {
		obj = ranges[i];
		if (obj.start > end) {
			break;
		}
		if (obj.end >= end) {
			endObj = obj;
			endIndex = i;
		}
	}

	if (endObj/* && endObj.start <= end && endObj.end >= start*/) {
		endObj.end = Math.max(end, endObj.end);

		if (start >= endObj.start) {
			return;
		}
		endObj.start = start;
	}

	//find object that overlaps with start
	for (i = Math.max(0, endIndex); i < ranges.length; i++) {
		obj = ranges[i];
		if (obj.start > start) {
			break;
		}
		if (obj.end >= start) {
			startObj = obj;
			startIndex = i;
		}
	}

	if (startObj/* && startObj.start <= end && startObj.end >= start*/) {
		startObj.start = Math.min(start, startObj.start);
		startObj.end = Math.max(startObj.end, end);

		// do not exit here because we may need to merge ranges
	}

	if (!startObj && !endObj) {
		// doesn't overlap with any existing object
		ranges.splice(i, 0, {
			start: start,
			end: end
		});
		return;
	}

	//merge if ranges overlap
	if (startObj && startIndex) {
		endIndex = startIndex - 1;
		endObj = ranges[endIndex];

		if (endObj && startObj !== endObj && startObj.end >= endObj.start) {
			endObj.end = Math.max(startObj.end, endObj.end);
			ranges.splice(startIndex, 1);
		}
	}
};

TimeRangesInternal.prototype.subtract = function (start, end) {
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

TimeRangesInternal.prototype.reset = function (amount) {
	var ranges = this.ranges;
	if (!amount) {
		ranges.length = 0;
		return;
	}

	if (ranges.length) {
		ranges.length = 1;
		ranges[0].start = 0;
		ranges[0].end = amount;
	} else {
		ranges.push({
			start: 0,
			end: amount
		});
	}
};

TimeRangesInternal.prototype.copy = function (src) {
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

TimeRangesInternal.prototype.start = function (i) {
	var ranges = this.ranges;

	if (!i && !ranges.length) {
		return 0;
	}

	if (i >= 0 && i < ranges.length) {
		return ranges[i].start;
	}

	//todo: throw DOMException/INDEX_SIZE_ERR
};

TimeRangesInternal.prototype.end = function (i) {
	var ranges = this.ranges;

	if (!i && !ranges.length) {
		return 0;
	}

	if (i >= 0 && i < ranges.length) {
		return ranges[i].end;
	}

	//todo: throw DOMException/INDEX_SIZE_ERR
};

export default TimeRangesInternal;
