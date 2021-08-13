// ==UserScript==
// @name         Squirel Schedule: Add local time
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add the local time row to the Squirrel's Twitch schedule
// @author       CaptainFlint
// @match        https://squirrel.tv/schedule/
// @icon         https://www.google.com/s2/favicons?domain=squirrel.tv
// @updateURL    https://raw.githubusercontent.com/CaptainFlint/SquirrelScheduleTimezone/master/addLocalTime.js
// @downloadURL  https://raw.githubusercontent.com/CaptainFlint/SquirrelScheduleTimezone/master/addLocalTime.js
// @supportURL   https://github.com/CaptainFlint/SquirrelScheduleTimezone/issues
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	// User-configurable section
	const USE_24_HOURS_FORMAT = true;
	// End of user-configurable section

	var $ = jQuery;

	var monthNames = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec',
	];

	// Two-digit formatting
	function num2str(num) {
		return (((num < 10) ? '0' : '') + num);
	}

	// Convert from '29th March 2021' into '2021-03-29'
	function dateToRfc(dateStr) {
		var dateParts = dateStr.split(' ');
		var dateStrRes = dateParts[2] + '-';
		for (var i = 0; i < monthNames.length; ++i) {
			if (dateParts[1].startsWith(monthNames[i])) {
				dateStrRes += num2str(i + 1) + '-';
				break;
			}
		}
		dateStrRes += num2str(dateParts[0].replace(/^(\d+)\D*$/, '$1'));
		return dateStrRes;
	}

	// Change the specified date by the specified amount of days
	function shiftDate(date, inc) {
		// Shifting is using the amount of milliseconds
		var d = new Date(new Date(date).valueOf() + inc * 86400000);
		return d.getFullYear() + '-' + num2str(d.getMonth()) + '-' + num2str(d.getDate());
	}

	// Convert hours from 12-hour format to 24-hour
	function from12to24(hours, timeOfDay) {
		var hours24;
		var isPM = (timeOfDay.toLowerCase() == 'pm');
		// 1am-11am => 1-11
		// 12pm => 12
		// 1pm-11pm => 13-23
		// 12am => 0/24
		if ((hours >= 1) && (hours <= 11)) {
			if (isPM) {
				hours24 = hours + 12;
			}
			else {
				hours24 = hours;
			}
		}
		else if ((hours == 12) || (hours == 0)) {
			hours24 = (isPM ? 12 : 0);
		}
		return hours24;
	}

	// Convert hours from 24-hour format to 12-hour
	function from24to12(hours) {
		var hours12;
		var timeOfDay;
		// 1-11 => 1am-11am
		// 12 => 12pm
		// 13-23 => 1pm-11pm
		// 0/24 => 12am
		if ((hours == 0) || (hours == 24)) {
			hours12 = 12;
			timeOfDay = 'am';
		}
		else if ((hours >= 1) && (hours <= 11)) {
			hours12 = hours;
			timeOfDay = 'am';
		}
		else if ((hours == 12)) {
			hours12 = 12;
			timeOfDay = 'pm';
		}
		else if ((hours >= 13) && (hours <= 23)) {
			hours12 = hours - 12;
			timeOfDay = 'pm';
		}
		return [hours12, timeOfDay];
	}

	// Calculates whether DST is in effect in UK at the specific date.
	// BST begins at 01:00 GMT on the last Sunday of March and ends at 01:00 GMT (02:00 BST) on the last Sunday of October.
	// This function only works with date, so last Sunday is considered to have the switched timezone.
	function isDSTinUK(date) {
		var d = new Date(date);
		var m = d.getMonth();
		if ((m < 2) || (m > 9)) {
			// Nov till Feb: no DST
			return false;
		}
		if ((m > 2) && (m < 9)) {
			// Apr till Sep: DST
			return true;
		}
		// Mar or Oct: calculate the last Sunday
		var lastSun = new Date(date.substr(0, 8) + '31');
		// Sunday is 0, so subtracting the day's number will bring us to the nearest Sunday
		// (subtracting is using the amount of milliseconds)
		lastSun = new Date(lastSun.valueOf() - lastSun.getDay() * 86400000);
		return (((m == 2) && (d >= lastSun)) || ((m == 9) && (d < lastSun)));
	}

	// Convert the UK time into local time for specific date
	function UKtimeToLocal(date, time) {
		var m = time.match(/^(\d+)(?::(\d+))?(am|pm)$/i);
		var errorRes = '<span style="color: red;">???</span>';
		if (!m) {
			return errorRes;
		}
		var hours = parseInt(m[1]);
		var minutes = (m[2] ? parseInt(m[2]) : 0);
		var td = m[3].toLowerCase();
		hours = from12to24(hours, td);
		if (!hours) {
			return errorRes;
		}
		var refDatetimeStr = date + 'T' + num2str(hours) + ':' + num2str(minutes) + ':00' + (isDSTinUK(date) ? '+0100' : '+0000');
		var localDatetime = new Date(refDatetimeStr);
		var resH = localDatetime.getHours();
		var resM = localDatetime.getMinutes();
		if (USE_24_HOURS_FORMAT) {
			return num2str(resH) + ':' + num2str(resM);
		}
		else {
			var [resH12, resTD] = from24to12(resH);
			return resH12 + (resM ? (':' + num2str(resM)) : '') + resTD;
		}
	}

	////////////////////////////////////////////////////////////////////////////////
	// Main code

	// Fetch the starting date of the scheduled week
	var startDate;
	$('h2').each(function() {
		var txt = $(this).text();
		if (txt.startsWith('Week Commencing Mon ')) {
			startDate = dateToRfc(txt.replace(/Week Commencing Mon /i, ''));
		}
	});

	// Extract times from the UK table row and convert into local time

	var tableRow = $($('tr')[1]); // Currently there's only one table on the schedule page, and UK takes the second row (first is headers)
	var tableRowLocal = tableRow.clone();
	var tableCells = tableRowLocal.children();
	// Set the first cell's content: the row header
	$(tableCells[0]).html('<span style="color:yellow">Your time</span>');
	// Process the rest of the cells: times at specific week days
	for (var i = 1; i < tableCells.length; ++i) {
		var cell = $(tableCells[i]);
		if (!cell.text().trim()) {
			continue;
		}
		cell.html(cell.html().replace(/(\d+)(?::(\d+))?(am|pm)/gi, function(match) { return UKtimeToLocal(shiftDate(startDate, i - 1), match); }));
	}

	tableRow.before(tableRowLocal);
})();
