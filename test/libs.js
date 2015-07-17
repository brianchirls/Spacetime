'use strict';

import test from 'tape';
import TimeRanges from '../lib/time-ranges';
import parseTimeCode from '../lib/parse-timecode';
import eventEmitterize from '../lib/event-emitterize';

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

	t.ok(ranges.includes(2), 'Includes min');
	t.ok(ranges.includes(4), 'Includes max');
	t.ok(ranges.includes(2, 4), 'Includes min-max');
	t.ok(ranges.includes(7, 7.5), 'Includes inside second range');
	t.notOk(ranges.includes(1), 'Does not include < min');
	t.notOk(ranges.includes(5), 'Does not include > max');
	t.notOk(ranges.includes(1, 3), 'Does not include range overlapping min');
	t.notOk(ranges.includes(3, 5), 'Does not include range overlapping max');
	t.notOk(ranges.includes(4, 2), 'Does not include backwards range');

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

test('Event Emitter', function (t) {
	var obj,
		secondary,
		ref,
		counts = {
			once: 0,
			on: 0
		},
		methods = [
			'on', 'off', 'once', 'emit', 'removeAllListeners', 'addEventListener', 'removeEventListener'
		];

	function removeMe(arg) {
		t.fail('Removed event should never run (' + arg + ')');
	}

	secondary = eventEmitterize();
	t.ok(secondary && typeof secondary === 'object' && typeof secondary.on === 'function',
		'running with no params creates an object');

	obj = {};
	eventEmitterize(obj);
	methods.forEach((key) => {
		t.equal(typeof obj[key], 'function', 'event emitter has method ' + key);
	});

	t.equal(obj.on, obj.addEventListener, 'addEventListener is a synonym for on');
	t.equal(obj.off, obj.removeEventListener, 'removeEventListener is a synonym for off');

	// emit
	secondary.on('none', () => {
		t.fail('Event should not be fired on another object');
	});
	obj.on('never', () => {
		t.fail('Callback should not be invoked on another event');
	});
	ref = obj.emit('none');
	t.equal(ref, obj, 'emit: returns self object');

	// once
	ref = obj.once('once', function () {
		counts.once++;
		t.equal(counts.once, 1, 'Once runs only once');
		t.equal(this, obj, 'once: context');
	});
	t.equal(ref, obj, 'once: returns self object');

	obj.emit('once');
	obj.emit('once');
	t.equal(counts.once, 1, 'once has actually run once');

	obj.once('once-removed', removeMe);
	obj.off('once-removed', removeMe);
	obj.emit('once-removed', 'once-removed');
	obj.once('once-remove-all', removeMe);
	obj.once('once-remove-all-events', removeMe);
	obj.removeAllListeners('once-remove-all');
	obj.emit('once-remove-all');
	obj.removeAllListeners();
	obj.emit('once-remove-all-events');

	// on
	ref = obj.on('on', function () {
		if (!counts.on) {
			t.equal(this, obj, 'on: context');
		}
		counts.on++;
	});
	t.equal(ref, obj, 'on: returns self object');

	obj.emit('on');
	obj.emit('on');
	t.equal(counts.on, 2, 'on has actually run twice');

	obj.on('on-removed', removeMe);
	obj.off('on-removed', removeMe);
	obj.emit('on-removed', 'on-removed');
	obj.once('on-remove-all', removeMe);
	obj.once('on-remove-all-events', removeMe);
	obj.removeAllListeners('on-remove-all');
	obj.emit('on-remove-all');
	obj.removeAllListeners();
	obj.emit('on-remove-all-events');

	t.end();
});
