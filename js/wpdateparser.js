define(["jquery", "underscore" ], function($, _) {

	var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var monthShortnames = _.map(monthNames, function(m){return m.substring(0,3)});
	var months = _.union(monthNames, monthShortnames);
	var ords = ['th', 'st', 'nd', 'rd'];

	var tokens = {
		M: "({0})".format(months.join('|')), // months
		D: "(\\d{1,2})" + "({0})?".format(ords.join('|')), // day
		Y: "(\\d{4})", // year
		T: "(/|-|–|\\sto\\s|\\sand\\s)", // interval delimiter
		O: "('*ongoing'*?|'*present'*)", // ongoing event
		F: "From", // ongoing event
		S: "[,\\s]*", // whitespace
		P: "\\|", // pipe
		A: "([^-–]*)" // other text
	};

	var ws = tokens.S;

	var expand = function(pattern) {
		_.each(tokens, function(token, symbol) {
			pattern = pattern.replace(new RegExp("%" + symbol, 'g'), ws + token + ws);
		});
		return pattern;
	}

	var getMonth = function(month) {
		var index = _.indexOf(monthNames, month);
		if(index < 0) {
			index = _.indexOf(monthShortnames, month);
		}
		return index;
	};

	var patterns = {};

	// 22 February 2011 – 9 June 2011
	patterns[expand("%D%M%Y%T%D%M%Y")] = function(m) {
		var year = m[3], month = getMonth(m[2]), date = m[1], year2 = m[7], month2 = getMonth(m[6]), date2 = m[5];
		return [new Date(year, month, date), new Date(year2, month2, date2)];
	};

	// February 22 2011 – June 9 2011
	patterns[expand("%M%D%Y%T%M%D%Y")] = function(m) {
		var year = m[3], month = getMonth(m[1]), date = m[2], year2 = m[7], month2 = getMonth(m[5]), date2 = m[6];
		return [new Date(year, month, date), new Date(year2, month2, date2)];
	};

	// February 21 – April 30, 2011
	patterns[expand("%M%D%T%M%D%Y")] = function(m) {
		var year = m[6], month = getMonth(m[1]), date = m[2], month2 = getMonth(m[4]), date2 = m[5];
		return [new Date(year, month, date), new Date(year, month2, date2)];
	};

	// 12 February – 30 April 2011
	patterns[expand("%D%M%T%D%M%Y")] = function(m) {
		var year = m[6], month = getMonth(m[2]), date = m[1], month2 = getMonth(m[5]), date2 = m[4];
		return [new Date(year, month, date), new Date(year, month2, date2)];
	};

	// 15–28 May 1974
	patterns[expand("%D%T%D%M%Y")] = function(m) {
		var year = m[5], month = getMonth(m[4]), date1 = m[1], date2 = m[3];
		return [new Date(year, month, date1), new Date(year, month, date2)];
	};

	// December 14-19, 1970 
	patterns[expand("%M%D%T%D%Y")] = function(m) {
		var year = m[5], month = getMonth(m[1]), date1 = m[2], date2 = m[4];
		return [new Date(year, month, date1), new Date(year, month, date2)];
	};
	//
	// 21 to 31 August 1992 
	patterns[expand("%D%T%D%M%Y")] = function(m) {
		var year = m[5], month = getMonth(m[4]), date1 = m[1], date2 = m[3];
		return [new Date(year, month, date1), new Date(year, month, date2)];
	};

	// May 1968 - June 1968 
	patterns[expand("%M%Y%T%M%Y")] = function(m) {
		var year = m[2], month = getMonth(m[1]), year2 = m[5], month2 = getMonth(m[4]);
		return [new Date(year, month, 1), new Date(year2, month2, 30)];
	};

	// May - June 1968 
	patterns[expand("%M%T%M%Y")] = function(m) {
		var year = m[4], month = getMonth(m[1]), month2 = getMonth(m[3]);
		return [new Date(year, month, 1), new Date(year, month2, 30)];
	};

	// 1968 - 1969
	patterns[expand("%Y%T%Y")] = function(m) {
		var year = m[1], year2 = m[3];
		return [new Date(year, 0, 1), new Date(year2, 11, 31)];
	};

	// 2001|10|12 - present
	patterns[expand("%Y%P%D%P%D%T%O")] = function(m) {
		var year = m[1], month = parseInt(m[2]) - 1, date = m[3];
		return [new Date(year, month, date), new Date()];
	};

	// May 12 2001 - present
	patterns[expand("%M%D%Y%T%O")] = function(m) {
		var year = m[3], month = getMonth(m[1]), date = m[2];
		return [new Date(year, month, date), new Date()];
	};

	// 12 May 2001 - present
	patterns[expand("%D%M%Y%T%O")] = function(m) {
		var year = m[3], month = getMonth(m[2]), date = m[1];
		return [new Date(year, month, date), new Date()];
	};

	// May 2001 - present
	patterns[expand("%M%Y%T%O")] = function(m) {
		var year = m[2], month = getMonth(m[1]);
		return [new Date(year, month, 1), new Date()];
	};

	// 2011 - present
	patterns[expand("%Y%T%O")] = function(m) {
		var year = m[1];
		return [new Date(year, 0, 1), new Date()];
	};

	// From 15 October 2011 
	patterns[expand("%F%D%M%Y")] = function(m) {
		var year = m[3], month = getMonth(m[2]), date1 = m[1];
		return [new Date(year, month, date1), new Date()];
	};

	// 15 October 2011
	patterns[expand("%D%M%Y")] = function(m) {
		var year = m[3], month = getMonth(m[2]), date1 = m[1];
		return [new Date(year, month, date1), new Date(year, month, parseInt(date1) + 1)];
	};

	// October 15 2011
	patterns[expand("%M%D%Y")] = function(m) {
		var year = m[3], month = getMonth(m[1]), date1 = m[2];
		return [new Date(year, month, date1), new Date(year, month, parseInt(date1) + 1)];
	};

	// October 2011 
	patterns[expand("%M%Y")] = function(m) {
		var year = m[2], month = getMonth(m[1]);
		return [new Date(year, month, 1), new Date(year, month, 30)];
	};

	// 2011 
	patterns[expand("%Y")] = function(m) {
		var year = m[1];
		return [new Date(year, 0, 1), new Date(year, 11, 31)];
	};

	var lastPattern;
	function parse(text) {
		var match, re, dates;
		_.each(patterns, function(converter, pattern) {
			if(!dates) {
				re = new RegExp(pattern, "i");
				if(match = text.match(re)) {
					//console.log(re, match);
					match = _.compact(_.difference(match, ords));
					dates = converter(match);
					lastPattern = pattern;
				}
			}
		});
		return dates;
	}

	function test(text, date1, date2) {
		var parsed = parse(text);
		var dates = Array.prototype.slice.call(arguments, 1);
		console.assert(parsed.length == dates.length);
		_.each(_.zip(parsed, dates), function(item) {
			console.assert(item[0].getTime() == item[1].getTime(), text, lastPattern);
		});
	}

	test("22 February 2011 – 9 June 2011", new Date(2011, 1, 22), new Date(2011, 5, 9));
	test("December 14-19, 1970", new Date(1970, 11, 14), new Date(1970, 11, 19));
	test("21 to 31 August 1992", new Date(1992, 7, 21), new Date(1992, 7, 31));
	test("12 and 17 May 1992", new Date(1992, 4, 12), new Date(1992, 4, 17));
	test("15 October 2011", new Date(2011, 9, 15), new Date(2011, 9, 16));
	test("May 1968 - June 1968", new Date(1968, 4, 1), new Date(1968, 5, 30));
	test("May 1968", new Date(1968, 4, 1), new Date(1968, 4, 30));
	test("1968", new Date(1968, 0, 1), new Date(1968, 11, 31));

	return {
		test: test,
		parse: parse
	}
});
