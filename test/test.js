'use strict';

import test from 'tape';
import TimeRanges from '../lib/time-ranges';
import parseTimeCode from '../lib/parse-timecode';

test('TimeRanges', function (t) {
	var ranges = new TimeRanges();

	t.equal(ranges.length, 1, 'Correct number of ranges on empty object');
	t.equal(ranges.start(0), 0, 'Empty range starts at 0');
	t.equal(ranges.end(0), 0, 'Empty range ends at 0');

	// Add a simple range to an empty object
	ranges.add(2, 4);
	t.equal(ranges.length, 1, 'One range [2-4]');
	t.equal(ranges.start(0), 2, 'Added range starts at 2');
	t.equal(ranges.end(0), 4, 'Added range ends at 4');

	// add a second range
	ranges.add(6, 8);
	t.equal(ranges.length, 2, 'Two ranges [1-3, 6-8]');
	t.deepEqual(ranges.ranges, [
		{
			start: 2,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Second range added');

	t.equal(ranges.pub.length, ranges.ranges.length, 'public object matches internal (length)');
	t.equal(ranges.pub.start(1), ranges.start(1), 'public object matches internal (start)');
	t.equal(ranges.pub.end(1), ranges.end(1), 'public object matches internal (end)');

	ranges.add(1.5, 4);
	t.deepEqual(ranges.ranges, [
		{
			start: 1.5,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Extend range at beginning, match at end');

	ranges.add(1, 1.5);
	t.deepEqual(ranges.ranges, [
		{
			start: 1,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Extend range at beginning, match at beginning');

	ranges.add(0, 3);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Extend range at beginning, match in middle');

	ranges.add(0, 4);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Add redundant range match on both ends');

	ranges.add(1, 3);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Add redundant range in middle');

	ranges.add(4, 6);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 8
		}
	], 'Merge ranges match at beginning and end');

	ranges.add(10, 12);
	ranges.add(8, 11);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 12
		}
	], 'Merge ranges match at beginning');

	ranges.add(13, 15);
	ranges.add(8, 13);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 15
		}
	], 'Merge ranges match at end');

	ranges.reset(10);
	t.deepEqual(ranges.ranges, [
		{
			start: 0,
			end: 10
		}
	], 'Reset with amount');

	ranges.reset();
	t.equal(ranges.ranges.length, 0, 'TimeRanges reset to 0');

	ranges.add(1, 10);
	ranges.subtract(10, 12);
	t.deepEqual(ranges.ranges, [
		{
			start: 1,
			end: 10
		}
	], 'Subtracting outside range does nothing');

	ranges.subtract(8, 10);
	t.deepEqual(ranges.ranges, [
		{
			start: 1,
			end: 8
		}
	], 'Subtract at end');

	ranges.subtract(0, 2);
	t.deepEqual(ranges.ranges, [
		{
			start: 2,
			end: 8
		}
	], 'Subtract at beginning');

	ranges.subtract(4, 6);
	t.deepEqual(ranges.ranges, [
		{
			start: 2,
			end: 4
		},
		{
			start: 6,
			end: 8
		}
	], 'Subtract from middle');

	ranges.subtract(0, 20);
	t.equal(ranges.ranges.length, 0, 'Subtract everything');

	t.end();
});

test('parseTimeCode', function (t) {
	t.equal(parseTimeCode(1.2), 1.2, 'seconds as number');
	t.ok(isNaN(parseTimeCode('not a number')), 'bad number returns NaN');
	t.ok(isNaN(parseTimeCode(null)), 'null returns NaN');
	t.equal(parseTimeCode('1.2'), 1.2, 'seconds as decimal');
	t.equal(parseTimeCode('1:2', 30), 62, 'min:sec, no frame rate');
	t.equal(parseTimeCode('1;2', 30), 1 + 2 / 30, 'sec;frames with frame rate');
	t.equal(parseTimeCode('1:2:3'), 60 * 60 + 2 * 60 + 3, 'hours:min:sec, no frame rate');
	t.equal(parseTimeCode('1:2:3.4'), 60 * 60 + 2 * 60 + 3.4, 'hours:min:sec, seconds as decimal, no frame rate');
	t.equal(parseTimeCode('1:2:3;4'), 60 * 60 + 2 * 60 + 3, 'hours:min:sec;frames without frame rate');
	t.equal(parseTimeCode('1:2:3;4', 30), 60 * 60 + 2 * 60 + 3 + 4 / 30, 'hours:min:sec;frames with frame rate');
	t.equal(parseTimeCode('1:2;3', 30), 60 + 2 + 3 / 30, 'min:sec;frames with frame rate');

	t.end();
});
