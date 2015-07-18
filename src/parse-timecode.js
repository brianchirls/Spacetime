'use strict';

var timeCodeRegex = /^(?:(\d+):){0,1}?(?:(?:(\d+):)?((\d+)(?:([\.;])(\d+))?))$/;

function parseTimeCode(timecode, frameRate) {
	var match,
		hour = 0,
		minute = 0,
		second = 0;

	if (typeof timecode === 'number') {
		return timecode;
	}

	if (typeof timecode === 'string') {
		match = timeCodeRegex.exec(timecode);
		if (match) {
			if (match[1]) {
				hour = parseInt(match[1], 10);
			}
			if (match[2]) {
				minute = parseInt(match[2], 10);
			}
			if (match[5] === '.') {
				second += parseFloat(match[3]);
			} else {
				second = parseInt(match[4], 10);
				if (match[5] === ';' && frameRate > 0) {
					second += parseInt(match[6], 10) / frameRate;
				}
			}
			return (hour * 60 + minute) * 60 + second;
		}
	}

	return NaN;
}

export default parseTimeCode;
