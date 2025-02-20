/**
 * @name core.player
 * @namespace Functions operating on player objects, parts of player objects, or arrays of player objects.
 */

define(["dao","globals","core/player/playerbaseball", "core/finances", "data/injuries", "data/names", "lib/bluebird", "lib/faces", "lib/underscore", "util/eventLog", "util/helpers", "util/random"], function (dao,g, playerSport,finances, injuries, names, Promise,  faces, _, eventLog, helpers, random) {

    "use strict";

	// took out ovr,skills,genRatings,pos


		
    /**
     * Limit a rating to between 0 and 100.
     *
     * @memberOf core.player
     * @param {number} rating Input rating.
     * @return {number} If rating is below 0, 0. If rating is above 100, 100. Otherwise, rating.
     */
   function limitRating(rating) {
        if (rating > 100) {
            return 100;
        }
        if (rating < 0) {
            return 0;
        }
        return Math.floor(rating);
    }

	
	
    /**
     * Generate a contract for a player.
     * 
     * @memberOf core.player
     * @param {Object} ratings Player object. At a minimum, this must have one entry in the ratings array.
     * @param {boolean} randomizeExp If true, then it is assumed that some random amount of years has elapsed since the contract was signed, thus decreasing the expiration date. This is used when generating players in a new league.
     * @return {Object.<string, number>} Object containing two properties with integer values, "amount" with the contract amount in thousands of dollars and "exp" with the contract expiration year.
     */
    function genContract(p, randomizeExp, randomizeAmount, noLimit) {
        var amount, expiration, maxAmount, minAmount, potentialDifference, ratings, years;

        ratings = _.last(p.ratings);

        randomizeExp = randomizeExp !== undefined ? randomizeExp : false;
        randomizeAmount = randomizeAmount !== undefined ? randomizeAmount : true;
        noLimit = noLimit !== undefined ? noLimit : false;

        // Limits on yearly contract amount, in $1000's
        minAmount = 480;
        maxAmount = 30000;

        // Scale proportional to (ovr*2 + pot)*0.5 120-210
        //amount = ((3 * value(p)) * 0.85 - 110) / (210 - 120);  // Scale from 0 to 1 (approx)
        //amount = amount * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value - 1) / 100 - 0.45) * 3.5 * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value - 1) / 100 - 0.60) * 3.5 * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value - 1) / 100 - 0.60) * 1.5 * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value- 1) / 100 - 0.60) * 2.4 * (maxAmount - minAmount) + minAmount;
        amount = ((p.value - 1) / 100 - 0.40) * 3.2 * (maxAmount - minAmount) + minAmount;
        //amount = ((p.value - 1) / 100 - 0.50) * 2.9 * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value - 1) / 100 - 0.40) * 2.1 * (maxAmount - minAmount) + minAmount;
//        amount = ((p.value - 1) / 100 - 0.40) * 1.9 * (maxAmount - minAmount) + minAmount;
        if (randomizeAmount) {
            amount *= helpers.bound(random.realGauss(1, 0.1), 0, 2);  // Randomize
        }
        maxAmount = 3000000000;

        // Expiration
        // Players with high potentials want short contracts
        potentialDifference = Math.round((ratings.pot - ratings.ovr) / 4.0);
        years = 5 - potentialDifference;
        if (years < 2) {
            years = 2;
        }
        // Bad players can only ask for short deals
        if (ratings.pot < 45) {
            years = 1;
        } else if (ratings.pot < 50) {
            years = 2;
        } else if (ratings.pot < 55) {
            years = 3;
        }

        // Randomize expiration for contracts generated at beginning of new game
        if (randomizeExp) {
            years = random.randInt(1, years);

            // Make rookie contracts more reasonable
            if (g.season - p.born.year <= 24) {
				years = 25 - (g.season - p.born.year);
                amount /= 4; // Max $5 million/year
            }
        }

        expiration = g.season + years - 1;

        if (!noLimit) {
            if (amount < minAmount * 1.1) {
                amount = minAmount;
            }// else if (amount > maxAmount) {
         //       amount = maxAmount;
        //    }
        } else {
            // Well, at least keep it positive
            if (amount < 0) {
                amount = 0;
            }
        }

//        amount = 50 * Math.round(amount / 50);  // Make it a multiple of 50k
        amount = 20 * Math.round(amount / 20);  // Make it a multiple of 50k

        return {amount: amount, exp: expiration};
    }

    /**
     * Store a contract in a player object.
     * 
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {Object} contract Contract object with two properties, exp (year) and amount (thousands of dollars).
     * @param {boolean} signed Is this an official signed contract (true), or just part of a negotiation (false)?
     * @return {Object} Updated player object.
     */
    function setContract(p, contract, signed) {
        var i, start;

        p.contract = contract;

        // Only write to salary log if the player is actually signed. Otherwise, we're just generating a value for a negotiation.
        if (signed) {
            // Is this contract beginning with an in-progress season, or next season?
            start = g.season;
            if (g.phase > g.PHASE.AFTER_TRADE_DEADLINE) {
                start += 1;
            }

            for (i = start; i <= p.contract.exp; i++) {
                p.salaries.push({season: i, amount: contract.amount});
            }
        }

        return p;
    }

    /**
     * Develop (increase/decrease) player's ratings. This operates on whatever the last row of p.ratings is.
     * 
     * Make sure to call player.updateValues after this! Otherwise, player values will be out of sync.
     * 
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {number=} years Number of years to develop (default 1).
     * @param {boolean=} generate Generating a new player? (default false). If true, then the player's age is also updated based on years.
     * @param {number=} coachingRank From 1 to g.numTeams (default 30), where 1 is best coaching staff and 30 is worst. Default is 15.5
     * @return {Object} Updated player object.
     */
    function develop(p, years, generate, coachingRank) {
        var age, baseChange, i, j, ratingKeys, r, sigma, sign;

        years = years !== undefined ? years : 1;
        generate = generate !== undefined ? generate : false;
        coachingRank = coachingRank !== undefined ? coachingRank : 15.5; // This applies to free agents!

        r = p.ratings.length - 1;

        age = g.season - p.born.year;

        for (i = 0; i < years; i++) {
            age += 1;

            // Randomly make a big jump
            if (Math.random() > 0.985 && age < 26) {
               p.ratings[r].pot += 10;
            }
        //    if (Math.random() < 0.015 && age < 26) {
        //       p.ratings[r].pot -= 5;
        //    }

            // Variance of ratings change is proportional to the potential difference
            sigma = (p.ratings[r].pot - p.ratings[r].ovr) / 10;

            // 60% of the time, improve. 20%, regress. 20%, stay the same
            baseChange = random.gauss(random.randInt(-1, 3), sigma);

            // Bound possible changes
//            if (baseChange > 30) {
//                baseChange = 30;
            if (baseChange > 50) {
                baseChange = 50;
            } else if (baseChange < -5) {
                baseChange = -5;
            }
            if (baseChange + p.ratings[r].pot > 95) {
                baseChange = 95 - p.ratings[r].pot;
            }

            // Modulate by potential difference, but only for growth, not regression
            if (baseChange > 0) {
//                baseChange *= 1 + (p.ratings[r].pot - p.ratings[r].ovr) / 8;
                baseChange *= 1 + (p.ratings[r].pot - p.ratings[r].ovr) / 25;
            }

		/*	if (age <21) {
			    if (baseChange >5) {
					baseChange = 5;			  
				}
			}*/
			if (age <21) {
					baseChange -= 2;			  
			}
			
			if (age <27) {
					baseChange += 2;			  
			}
						
            // Modulate by age
            if (age > 26) {
//					baseChange /= 3;
		//	    if (baseChange > 0) {
					baseChange = 0;
		//		}
            }
            if (age > 29) {
                baseChange -= 1;
            }
            if (age > 31) {
                baseChange -= 1;
            }
            if (age > 33) {
                baseChange -= 1;
            }

            // Modulate by coaching
            sign = baseChange ? baseChange < 0 ? -1 : 1 : 0;
            if (sign >= 0) { // life is normal
                baseChange *= ((coachingRank - 1) * (-0.5) / (g.numTeams - 1)  + 1.25);
            } else {
                baseChange *= ((coachingRank - 1) * (0.5) / (g.numTeams - 1)  + 0.75);
            }

            /*ratingKeys = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'blk', 'stl', 'drb', 'pss', 'reb'];
            for (j = 0; j < ratingKeys.length; j++) {
                //increase = plusMinus
                p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(1, 2) * baseChange);
            }*/
            // Easy to improve
		//	console.log("position: "+p.pos);
			
			
			if ( (p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
			
				ratingKeys = ['drb','pss','reb','hgt'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 25));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 15));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 10));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -5, 10));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
				}
				// In between
				ratingKeys = ['stl','stre','spd','jmp'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 15));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 8));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
				}
				// Hard to improve
//				ratingKeys = ['blk','endu','ins','dnk','ft','fg','tp'];
				if (age <30) {
					ratingKeys = ['endu','ft','tp'];
				} else {
					ratingKeys = ['endu','ft','tp'];
				}				
				//ratingKeys = ['blk','endu','ft','fg','tp'];
				for (j = 0; j < ratingKeys.length; j++) {
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 10));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}

				// Barely moves
//				ratingKeys = ['blk','endu','ins','dnk','ft','fg','tp'];
				//ratingKeys = ['ins','dnk'];
				if (age <30) {
					ratingKeys = ['ins','dnk'];
				} else {
					ratingKeys = ['ins','dnk','blk','fg'];
				}				
				for (j = 0; j < ratingKeys.length; j++) {
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 5));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}



				

			} else if  ( (p.pos == "CF") )  {
			
				ratingKeys = ['hgt', 'ins','tp'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 25));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 15));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
				}
				// In between
//				ratingKeys = ['stre','spd','jmp','tp','dnk'];
				ratingKeys = ['stre','spd','jmp','dnk'];
				for (j = 0; j < ratingKeys.length; j++) {
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 10));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 15));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
				}
				// Hard to improve
//				ratingKeys = ['fg', 'ft', 'endu'];
		//		ratingKeys = ['fg', 'ft', 'endu','tp'];
				if (age <30) {
					ratingKeys = ['ft', 'endu','tp'];
				} else {
					ratingKeys = ['ft', 'endu','tp'];
				}					
				for (j = 0; j < ratingKeys.length; j++) {
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 10));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}
				
				// Barely moves
//				ratingKeys = ['blk','endu','ins','dnk','ft','fg','tp'];
				ratingKeys = ['blk','stl', 'drb', 'pss', 'reb'];
				for (j = 0; j < ratingKeys.length; j++) {
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -5, 5));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}
			
				if (age <30) {
					//ratingKeys = ['fg', 'ft', 'endu','tp'];
				} else {
					ratingKeys = ['fg'];
					for (j = 0; j < ratingKeys.length; j++) {
						p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 5));
		//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
					}
					
				}					
							
			
			} else   {
			
				ratingKeys = ['hgt', 'ins','dnk'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -100, 45));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -10, 25));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -10, 15));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(2, 2) * baseChange, -5, 10));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
				}
				// In between
				ratingKeys = ['stre','spd','jmp','tp'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 10));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
				}
				// Hard to improve
				//ratingKeys = ['fg', 'ft', 'endu'];
				if (age <30) {
					ratingKeys = ['ft', 'endu'];
				} else {
					ratingKeys = ['ft', 'endu'];
				}					
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 10));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 10));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}
				
				// Barely moves
//				ratingKeys = ['blk','endu','ins','dnk','ft','fg','tp'];
				ratingKeys = ['blk','stl', 'drb', 'pss', 'reb'];
				for (j = 0; j < ratingKeys.length; j++) {
//					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -5, 5));
					p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -5, 5));
	//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
				}
				
				
				if (age <30) {
					//ratingKeys = ['fg', 'ft', 'endu','tp'];
				} else {
					ratingKeys = ['fg'];
					for (j = 0; j < ratingKeys.length; j++) {
						p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 5));
		//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
					}
					
				}					
						
			
			}
			
			
			
            // Update overall and potential
            p.ratings[r].ovr = playerSport.ovr(p.ratings[r]);
			
			if (age > 21) {
				p.ratings[r].pot += -2 + Math.round(random.gauss(0, 2));
			} else {
				p.ratings[r].pot += -2 + Math.round(random.gauss(0, 2));
			}
            if (p.ratings[r].ovr > p.ratings[r].pot || age > 28) {
                p.ratings[r].pot = p.ratings[r].ovr;
            }
			

        }

        // If this isn't here outside the loop, then 19 year old players could still have ovr > pot
        if (p.ratings[r].ovr > p.ratings[r].pot || age > 26) {
            p.ratings[r].pot = p.ratings[r].ovr;
        }

        // Likewise, If this isn't outside the loop, then 19 year old players don't get skills
        p.ratings[r].skills = playerSport.skills(p.ratings[r]);
		
		
/*		if ((age < 20) && (p.ratings[r].ovr > 60)) {
		  p.ratings[r].ovr  = p.ratings[r].ovr ;
		} else if ((age < 24) && (p.ratings[r].ovr > 70)) {
		  p.ratings[r].ovr  = 70;
		} */
				
        if (generate) {
            age = g.season - p.born.year + years;
            p.born.year = g.season - age;
        }
		
		
        return p;
    }

    /**
     * Add or subtract amount from all current ratings and update the player's contract appropriately.
     * 
     * This should only be called when generating players for a new league. Otherwise, develop should be used. Also, make sure you call player.updateValues and player.setContract after this, because ratings are changed!
     * 
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {number} amount Number to be added to each rating (can be negative).
     * @return {Object} Updated player object.
     */
    function bonus(p, amount) {
        var age, i, key, r, ratingKeys;

        // Make sure age is always defined
        age = g.season - p.born.year;

        r = p.ratings.length - 1;

        ratingKeys = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'blk', 'stl', 'drb', 'pss', 'reb', 'pot'];
        for (i = 0; i < ratingKeys.length; i++) {
            key = ratingKeys[i];
            p.ratings[r][key] = limitRating(p.ratings[r][key] + amount);
//            p.ratings[r][key] = limitrating.limitRating(p.ratings[r][key] + amount);
        }

        // Update overall and potential
        p.ratings[r].ovr = playerSport.ovr(p.ratings[r]);
        if (p.ratings[r].ovr > p.ratings[r].pot || age > 28) {
            p.ratings[r].pot = p.ratings[r].ovr;
        }


		return p;
    }

    /**
     * Calculates the base "mood" factor for any free agent towards a team.
     *
     * This base mood is then modulated for an individual player in addToFreeAgents.
     * 
     * @param {(IDBObjectStore|IDBTransaction|null)} ot An IndexedDB object store or transaction on teams; if null is passed, then a new transaction will be used.
     * @return {Promise} Array of base moods, one for each team.
     */
    function genBaseMoods(ot) {
        return dao.teams.getAll({ot: ot}).then(function (teams) {
            var baseMoods, i, s;

        baseMoods = [];


            s = teams[0].seasons.length - 1;  // Most recent season index

            for (i = 0; i < teams.length; i++) {
                // Special case for winning a title - basically never refuse to re-sign unless a miracle occurs
                if (teams[i].seasons[s].playoffRoundsWon === 3 && Math.random() < 0.99) {
                    baseMoods[i] = -0.25; // Should guarantee no refusing to re-sign
                } else { 				
				
					baseMoods[i] = 0;

					// Hype
					baseMoods[i] += 0.5 * (1 - teams[i].seasons[s].hype);

					// Facilities
					baseMoods[i] += 0.1 * (1 - (finances.getRankLastThree(teams[i], "expenses", "facilities") - 1) /  (g.numTeams - 1));

					// Population
					baseMoods[i] += 0.2 * (1 - teams[i].seasons[s].pop / 10);

					// Randomness
					baseMoods[i] += random.uniform(-0.2, 0.2);

					baseMoods[i] = helpers.bound(baseMoods[i], 0, 1);
				}	
            }

            return baseMoods;
        });
    }

    /**
     * Adds player to the free agents list.
     * 
     * This should be THE ONLY way that players are added to the free agents
     * list, because this will also calculate their demanded contract and mood.
     * 
     * @memberOf core.player
     * @param {(IDBObjectStore|IDBTransaction|null)} ot An IndexedDB object store or transaction on players readwrite; if null is passed, then a new transaction will be used.
     * @param {Object} p Player object.
     * @param {?number} phase An integer representing the game phase to consider this transaction under (defaults to g.phase if null).
     * @param {Array.<number>} baseMoods Vector of base moods for each team from 0 to 1, as generated by genBaseMoods.
     * @return {Promise}
     */
    function addToFreeAgents(ot, p, phase, baseMoods) {
        var pr;

        phase = phase !== null ? phase : g.phase;

        pr = _.last(p.ratings);
        p = setContract(p, genContract(p), false);

        // Set initial player mood towards each team
        p.freeAgentMood = _.map(baseMoods, function (mood) {
            if (pr.ovr + pr.pot < 100) {
                // Bad players don't have the luxury to be choosy about teams
                return 0;
            }
            if (phase === g.PHASE.RESIGN_PLAYERS) {
                // More likely to re-sign your own players
                return helpers.bound(mood + random.uniform(-1, 0.5), 0, 1000);
            }
            return helpers.bound(mood + random.uniform(-1, 1.5), 0, 1000);
        });

        // During regular season, or before season starts, allow contracts for
        // just this year.
        if (phase > g.PHASE.AFTER_TRADE_DEADLINE) {
            p.contract.exp += 1;
        }

        p.tid = g.PLAYER.FREE_AGENT;

        p.ptModifier = 1; // Reset
        p.battingOrder = 0; // Reset

        // The put doesn't always work in Chrome. No idea why.
        return dao.players.put({ot: ot, value: p}).then(function () {
            return; // No output
        });
    }

    /**
     * Release player.
     * 
     * This keeps track of what the player's current team owes him, and then calls player.addToFreeAgents.
     * 
     * @memberOf core.player
     * @param {IDBTransaction} tx An IndexedDB transaction on players, releasedPlayers, and teams, readwrite.
     * @param {Object} p Player object.
     * @param {boolean} justDrafted True if the player was just drafted by his current team and the regular season hasn't started yet. False otherwise. If True, then the player can be released without paying his salary.
     * @return {Promise}
     */
    function release(tx, p, justDrafted) {
        // Keep track of player salary even when he's off the team, but make an exception for players who were just drafted
        // Was the player just drafted?
        if (!justDrafted) {
            dao.releasedPlayers.add({
                ot: tx,
                value: {
                    pid: p.pid,
                    tid: p.tid,
                    contract: p.contract
                }
            });
        }
		
        eventLog.add(null, {
            type: "release",
            text: 'The <a href="' + helpers.leagueUrl(["roster", g.teamAbbrevsCache[p.tid], g.season]) + '">' + g.teamNamesCache[p.tid] + '</a> released <a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a>.',
            showNotification: false,
            pids: [p.pid],
            tids: [p.tid]
        });
		

        return genBaseMoods(tx).then(function (baseMoods) {
            return addToFreeAgents(tx, p, g.phase, baseMoods);
        });
    }

    /**
     * Generate fuzz.
     *
     * Fuzz is random noise that is added to a player's displayed ratings, depending on the scouting budget.
     *
     * @memberOf core.player
     * @param {number=} coachingRank From 1 to g.numTeams (default 30), where 1 is best coaching staff and g.numTeams is worst. Default is 15.5
     * @return {number} Fuzz, between -5 and 5.
     */
    function genFuzz(scoutingRank) {
        var cutoff, fuzz, sigma;

        //cutoff = 0;  // Max error is from 2 to 10, based on scouting rank		
        cutoff = 2 + 8 * (scoutingRank - 1) / (g.numTeams - 1);  // Max error is from 2 to 10, based on scouting rank
        sigma = 1 + 2 * (scoutingRank - 1) /  (g.numTeams - 1);  // Stddev is from 1 to 3, based on scouting rank

        fuzz = random.gauss(0, sigma);
        if (fuzz > cutoff) {
            fuzz = cutoff;
        } else if (fuzz < -cutoff) {
            fuzz = -cutoff;
        }

        return fuzz;
    }
	
	
    function name(nationality) {
        var fn, fnRand, i, ln, lnRand;

        // First name
        fnRand = random.uniform(0, 90.04);
        for (i = 0; i < names.first.length; i++) {
            if (names.first[i][1] >= fnRand) {
                break;
            }
        }
        fn = names.first[i][0];


        // Last name
        lnRand = random.uniform(0, 77.48);
        for (i = 0; i < names.last.length; i++) {
            if (names.last[i][1] >= lnRand) {
                break;
            }
        }
        ln = names.last[i][0];

        return fn + " " + ln;
    }

	
	
	
    /**
     * Add a new row of ratings to a player object.
     * 
     * There should be one ratings row for each year a player is not retired, and a new row should be added for each non-retired player at the start of a season.
     *
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {number} scoutingRank Between 1 and g.numTeams (default 30), the rank of scouting spending, probably over the past 3 years via core.finances.getRankLastThree.
     * @return {Object} Updated player object.
     */
    function addRatingsRow(p, scoutingRank) {
        var key, newRatings, r;

        newRatings = {};
        r = p.ratings.length - 1; // Most recent ratings
        for (key in p.ratings[r]) {
            if (p.ratings[r].hasOwnProperty(key)) {
                newRatings[key] = p.ratings[r][key];
            }
        }
        newRatings.season = g.season;
        newRatings.fuzz = (newRatings.fuzz + genFuzz(scoutingRank)) / 2;
        p.ratings.push(newRatings);

        return p;
    }

    /**
     * Add a new row of stats to the playerStats database.
     * 
     * A row contains stats for unique values of (pid, team, season, playoffs). So new rows need to be added when a player joins a new team, when a new season starts, or when a player's team makes the playoffs. The team ID in p.tid and player ID in p.pid will be used in the stats row, so if a player is changing teams, update p.tid before calling this.
     *
     * The return value is the player object with an updated statsTids as its argument. This is NOT written to the database within addStatsRow because it is often updated in several different ways before being written. Only the entry to playerStats is actually written to the databse by this function (which happens asynchronously). You probably want to write the updated player object to the database soon after calling this, in the same transaction.
     *
     * @memberOf core.player
     * @param {(IDBObjectStore|IDBTransaction|null)} ot An IndexedDB object store or transaction on playerStats readwrite; if null is passed, then a new transaction will be used.
     * @param {Object} p Player object.
     * @param {=boolean} playoffs Is this stats row for the playoffs or not? Default false.
     * @return {Object} Updated player object.
     */
    function addStatsRow(ot, p, playoffs) {
        var ps, statsRow, stopOnSeason;

        playoffs = playoffs !== undefined ? playoffs : false;

        statsRow = {pid: p.pid,season: g.season, tid: p.tid, playoffs: playoffs, gp: 0, gs: 0, min: 0, fg: 0, fga: 0, fgAtRim: 0, fgaAtRim: 0, fgLowPost: 0, fgaLowPost: 0, fgMidRange: 0, fgaMidRange: 0, tp: 0, tpa: 0, ft: 0, fta: 0, orb: 0, drb: 0, trb: 0, ast: 0, tov: 0, stl: 0, blk: 0, pf: 0, pts: 0, per: 0, ewa: 0, winP: 0, lossP: 0, save: 0,errors:0,earnedRuns:0,fieldAttempts:0,babip:0,babipP:0,pitcherGS:0,ld:0,gb:0,fb:0,gbp:0,fbp:0,errorsp:0,abP:0,war:0,warP:0,warH:0,ISO:0,wOBA:0,warS:0,energy:1,energyLevel:100,pfE:0,warF:0, yearsWithTeam: 1};

        p.statsTids.push(p.tid);
        p.statsTids = _.uniq(p.statsTids);

        // Calculate yearsWithTeam
        // Iterate over player stats objects, most recent first
        ps = [];
        Promise.try(function () {
            if (!playoffs) {
                // Because the "pid, season, tid" index does not order by psid, the first time we see a tid !== p.tid could
                // be the same season a player was traded to that team, and there still could be one more with tid ===
                // p.tid. So when we se tid !== p.tid, set stopOnSeason to the previous (next... I mean lower) season so we
                // can stop storing stats when it's totally safe.
                stopOnSeason = 0;

                return dao.playerStats.iterate({
                    ot: ot,
                    index: "pid, season, tid",
                    key: IDBKeyRange.bound([p.pid, 0], [p.pid, g.season + 1]),
                    direction: "prev",
                    callback: function (psTemp, shortCircuit) {
                        // Skip playoff stats
                        if (psTemp.playoffs) {
                            return;
                        }

                        // Continue only if we haven't hit a season with another team yet
                        if (psTemp.season === stopOnSeason) {
                            shortCircuit();
                        } else {
                            if (psTemp.tid !== p.tid) {
                                // Hit another team! Stop after this season is exhausted
                                stopOnSeason = psTemp.season - 1;
                            }

                            // Store stats
                            ps.push(psTemp);
                        }
                    }
                });
            }
        }).then(function () {
            var i;

            ps = ps.sort(function (a, b) {
                // Sort seasons in descending order. This is necessary because otherwise the index will cause ordering to be by tid within a season, which is probably not what is ever wanted.
                return b.psid - a.psid;
            });

            // Count non-playoff seasons starting from the current one
            for (i = 0; i < ps.length; i++) {
                if (ps[i].tid === p.tid) {
                    statsRow.yearsWithTeam += 1;
                } else {
                    break;
                }
                // Is this a complete duplicate entry? If so, not needed. This can happen e.g. in fantasy draft
                // This is not quite a unique constraint because if a player is traded away from a team then back again, this check won't be reached because of the "break" above. That's fine. It shows the stints separately, which is probably best.
                if (ps[i].pid === statsRow.pid && ps[i].season === statsRow.season && ps[i].tid === statsRow.tid && ps[i].playoffs === statsRow.playoffs) {
                    return;
                }				
            }

            dao.playerStats.add({ot: ot, value: statsRow});
        });

        return p;
    }
	
    function generate(tid, age, profile, baseRating, pot, draftYear, newLeague, scoutingRank) {
        var maxHgt, minHgt, maxWeight, minWeight, nationality, p;

        p = {}; // Will be saved to database
        p.tid = tid;
        p.statsTids = [];
        p.rosterOrder = 666;  // Will be set later
        p.ratings = [];
        if (newLeague) {
            // Create player for new league
            p.ratings.push(playerSport.genRatings(profile, baseRating, pot, g.startingSeason, scoutingRank, tid));
        } else {
            // Create player to be drafted
            p.ratings.push(playerSport.genRatings(profile, baseRating, pot, draftYear, scoutingRank, tid));
        }

//        minHgt = 71;  // 5'10"
        minHgt = 72;  // 5'10", 6'2" 73.7 average
        maxHgt = 78;  // 6'6"
        minWeight = 160;
//        minWeight = 150; 190 average
        maxWeight = 230;

        p.pos = playerSport.pos(p.ratings[0]);  // Position (PG, SG, SF, PF, C, G, GF, FC)
	//	console.log(p.ratings[0].blk+" "+p.ratings[0].dnk);
		let tempBLK = 0;
		if (p.ratings[0].blk < 0) {
			tempBLK = 0;	
		} else {
			tempBLK = p.ratings[0].blk;	
			
		}
		let tempDNK = 0;
		if (p.ratings[0].dnk < 0) {
			tempDNK = 0;	
		} else {
			tempDNK = p.ratings[0].dnk;				
		}
			//	console.log(tempBLK+" "+tempDNK);

//        p.hgt = Math.round(random.randInt(-2, 2) + ((p.ratings[0].blk+p.ratings[0].dnk)/2) * (maxHgt - minHgt) / 100 + minHgt);  // Height in inches (from minHgt to maxHgt)
        p.hgt = Math.round(random.randInt(-2, 2) + ((tempDNK+tempBLK+100+100-p.ratings[0].fg-p.ratings[0].stl)/4) * (maxHgt - minHgt) / 100 + minHgt);  // Height in inches (from minHgt to maxHgt)
//        p.weight = Math.round(random.randInt(-20, 20) + (p.ratings[0].dnk + 0.5 * p.ratings[0].blk) * (maxWeight - minWeight) / 150 + minWeight);  // Weight in pounds (from minWeight to maxWeight)
        p.weight = Math.round(random.randInt(-20, 20) + (tempDNK + 0.5 * tempBLK+100+100-p.ratings[0].fg-p.ratings[0].stl) * (maxWeight - minWeight) / 350 + minWeight);  // Weight in pounds (from minWeight to maxWeight)

		
        if ((p.pos == "SP") || (p.pos == "RP")  || (p.pos == "CL") ) {
            p.offDefK = "def";
//        } else if (p.pos == "G") {
        } else  {
            p.offDefK = "off";
        } 
        //} else {
            //p.offDefK = "k";
        //}
//        p.active = Math.random() < 0.75 ? true : false; // Delete after real roster ordering AI exists
//        p.active = true; // Delete after real roster ordering AI exists
        p.active = false; // Delete after real roster ordering AI exists
				
		
        // Randomly choose nationality  
        nationality = 'USA';
        p.born = {
            year: g.season - age,
            loc: nationality
        };

        p.name = name(nationality);
        p.college = "";
        p.imgURL = ""; // Custom rosters can define player image URLs to be used rather than vector faces


        p.awards = [];

        p.freeAgentMood = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        p.yearsFreeAgent = 0;
        p.retiredYear = null;

        p.draft = {
            round: 0,
            pick: 0,
            tid: -1,
            originalTid: -1,
            year: draftYear,
            teamName: null,
            teamRegion: null,
            pot: pot,
            ovr: p.ratings[0].ovr,
            skills: p.ratings[0].skills
        };

        p.face = faces.generate();
        p.injury = {type: "Healthy", gamesRemaining: 0};
		p.energy = 100;
	//	p.posPlayedadj = "test";
		
		
        p.ptModifier = 1;
        p.battingOrder = 0; // Reset
        p.hof = false;
        p.watch = false;
        p.gamesUntilTradable = 0;

        // These should be set by player.updateValues after player is completely done (automatic in player.develop)
        p.value = 0;
        p.valueNoPot = 0;
        p.valueFuzz = 0;
        p.valueNoPotFuzz = 0;
        p.valueWithContract = 0;

        // Must be after value*s are set, because genContract depends on them
        p.salaries = [];
        p = setContract(p, genContract(p), false);

        return p;
    }

    /**
     * Pick injury type and duration.
     *
     * This depends on core.data.injuries, health expenses, and randomness.
     *
     * @param {number} healthRank From 1- g.numTeams (default 30), 1 if the player's team has the highest health spending this season and 30 if the player's team has the lowest.
     * @return {Object} Injury object (type and gamesRemaining)
     */
    function injury(healthRank) {
        var i, rand, type;

        rand = random.uniform(0, 10882);
        for (i = 0; i < injuries.cumSum.length; i++) {
            if (injuries.cumSum[i] >= rand) {
                break;
            }
        }
        return {
            type: injuries.types[i],
			gamesRemaining: Math.round((0.7 * (healthRank - 1) / (g.numTeams - 1) + 0.65)  * random.uniform(0.25, 1.75) * injuries.gamesRemainings[i])
 			
        };
    }

    /**
     * Filter a player object (or an array of player objects) by removing/combining/processing some components.
     *
     * This can be used to retrieve information about a certain season, compute average statistics from the raw data, etc.
     *
     * For a player object (p), create an object suitible for output based on the appropriate options, most notably a options.season and options.tid to find rows in of stats and ratings, and options.attributes, options.stats, and options.ratings to extract teh desired information. In the output, the attributes keys will be in the root of the object. There will also be stats and ratings properties containing filtered stats and ratings objects.
     * 
     * If options.season is undefined, then the stats and ratings objects will contain lists of objects for each season and options.tid is ignored. Then, there will also be a careerStats property in the output object containing an object with career averages.
     *
     * There are several more options (all described below) which can make things pretty complicated, but most of the time, they are not needed.
     * 
     * @memberOf core.player
     * @param {Object|Array.<Object>} p Player object or array of player objects to be filtered.
     * @param {Object} options Options, as described below.
     * @param {number=} options.season Season to retrieve stats/ratings for. If undefined, return stats/ratings for all seasons in a list as well as career totals in player.careerStats.
     * @param {number=} options.tid Team ID to retrieve stats for. This is useful in the case where a player played for multiple teams in a season. Eventually, there should be some way to specify whether the stats for multiple teams in a single season should be merged together or not. For now, if this is undefined, it just picks the first entry, which is clearly wrong.
     * @param {Array.<string>=} options.attrs List of player attributes to include in output.
     * @param {Array.<string>=} options.ratings List of player ratings to include in output.
     * @param {Array.<string>=} options.stats List of player stats to include in output.
     * @param {boolean=} options.totals Boolean representing whether to return total stats (true) or per-game averages (false); default is false.
     * @param {boolean=} options.playoffs Boolean representing whether to return playoff stats (statsPlayoffs and careerStatsPlayoffs) or not; default is false. Either way, regular season stats are always returned.
     * @param {boolean=} options.showNoStats When true, players are returned with zeroed stats objects even if they have accumulated no stats for a team (such as  players who were just traded for, free agents, etc.); this applies only for regular season stats. Even when this is true, undefined will still be returned if a season is requested from before they entered the league. To show draft prospects, options.showRookies is needed. Default is false, but if options.stats is empty, this is always true.
     * @param {boolean=} options.showRookies If true (default false), then future draft prospects and rookies drafted in the current season (g.season) are shown if that season is requested. This is mainly so, after the draft, rookies can show up in the roster, player ratings view, etc; and also so prospects can be shown in the watch list. After the next season starts, then they will no longer show up in a request for that season since they didn't actually play that season.
     * @param {boolean=} options.showRetired If true (default false), then players with no ratings for the current season are still returned, with either 0 for every rating and a blank array for skills (retired players) or future ratings (draft prospects). This is currently only used for the watch list, so retired players (and future draft prospects!) can still be watched.
     * @param {boolean=} options.fuzz When true (default false), noise is added to any returned ratings based on the fuzz variable for the given season (default: false); any user-facing rating should use true, any non-user-facing rating should use false.
     * @param {boolean=} options.oldStats When true (default false), stats from the previous season are displayed if there are no stats for the current season. This is currently only used for the free agents list, so it will either display stats from this season if they exist, or last season if they don't.
     * @param {number=} options.numGamesRemaining If the "cashOwed" attr is requested, options.numGamesRemaining is used to calculate how much of the current season's contract remains to be paid. This is used for buying out players.
     * @return {Object|Array.<Object>} Filtered player object or array of filtered player objects, depending on the first argument.
     */
    function filter(p, options) {
        var filterAttrs, filterRatings, filterStats, filterStatsPartial, fp, fps, gatherStats, i, returnOnePlayer;

        returnOnePlayer = false;
        if (!_.isArray(p)) {
            p = [p];
            returnOnePlayer = true;
        }

        options = options !== undefined ? options : {};
        options.season = options.season !== undefined ? options.season : null;
        options.tid = options.tid !== undefined ? options.tid : null;
        options.attrs = options.attrs !== undefined ? options.attrs : [];
        options.stats = options.stats !== undefined ? options.stats : [];
        options.ratings = options.ratings !== undefined ? options.ratings : [];
        options.totals = options.totals !== undefined ? options.totals : false;
        options.playoffs = options.playoffs !== undefined ? options.playoffs : false;
        options.showNoStats = options.showNoStats !== undefined ? options.showNoStats : false;
        options.showRookies = options.showRookies !== undefined ? options.showRookies : false;
        options.showRetired = options.showRetired !== undefined ? options.showRetired : false;
        options.fuzz = options.fuzz !== undefined ? options.fuzz : false;
        options.oldStats = options.oldStats !== undefined ? options.oldStats : false;
        options.numGamesRemaining = options.numGamesRemaining !== undefined ? options.numGamesRemaining : 0;
        options.per36 = options.per36 !== undefined ? options.per36 : false;

        // If no stats are requested, force showNoStats to be true since the stats will never be checked otherwise.
        if (options.stats.length === 0) {
            options.showNoStats = true;
        }

        // Copys/filters the attributes listed in options.attrs from p to fp.
        filterAttrs = function (fp, p, options) {
            var award, awardsGroupedTemp, i, j;

            for (i = 0; i < options.attrs.length; i++) {
                if (options.attrs[i] === "age") {
                    fp.age = g.season - p.born.year;
                } else if (options.attrs[i] === "draft") {
                    fp.draft = p.draft;
                    fp.draft.age = p.draft.year - p.born.year;
                    if (options.fuzz) {
                        fp.draft.ovr =  Math.round(helpers.bound(fp.draft.ovr + p.ratings[0].fuzz, 0, 100));
                        fp.draft.pot =  Math.round(helpers.bound(fp.draft.pot + p.ratings[0].fuzz, 0, 100));
                    }
                    // Inject abbrevs
                    fp.draft.abbrev = g.teamAbbrevsCache[fp.draft.tid];
                    fp.draft.originalAbbrev = g.teamAbbrevsCache[fp.draft.originalTid];
                } else if (options.attrs[i] === "hgtFt") {
                    fp.hgtFt = Math.floor(p.hgt / 12);
                } else if (options.attrs[i] === "hgtIn") {
                    fp.hgtIn = p.hgt - 12 * Math.floor(p.hgt / 12);
                } else if (options.attrs[i] === "contract") {
                    fp.contract = helpers.deepCopy(p.contract);  // [millions of dollars]
                    fp.contract.amount = fp.contract.amount / 1000;  // [millions of dollars]
                } else if (options.attrs[i] === "cashOwed") {
                    fp.cashOwed = contractSeasonsRemaining(p.contract.exp, options.numGamesRemaining) * p.contract.amount / 1000;  // [millions of dollars]
                } else if (options.attrs[i] === "abbrev") {
                    fp.abbrev = helpers.getAbbrev(p.tid);
                } else if (options.attrs[i] === "teamRegion") {
                    if (p.tid >= 0) {
                        fp.teamRegion = g.teamRegionsCache[p.tid];
                    } else {
                        fp.teamRegion = "";
                    }
                } else if (options.attrs[i] === "teamName") {
                    if (p.tid >= 0) {
                        fp.teamName = g.teamNamesCache[p.tid];
                    } else if (p.tid === g.PLAYER.FREE_AGENT) {
                        fp.teamName = "Free Agent";
                    } else if (p.tid === g.PLAYER.UNDRAFTED || p.tid === g.PLAYER.UNDRAFTED_2 || p.tid === g.PLAYER.UNDRAFTED_3 || p.tid === g.PLAYER.UNDRAFTED_FANTASY_TEMP) {
                        fp.teamName = "Draft Prospect";
                    } else if (p.tid === g.PLAYER.RETIRED) {
                        fp.teamName = "Retired";
                    }
          //      } else if (options.attrs[i] === "energy") {
          //          fp.energy = energy(p);
                } else if (options.attrs[i] === "injury" && options.season !== null && options.season < g.season) {
                    fp.injury = {type: "Healthy", gamesRemaining: 0};
                } else if (options.attrs[i] === "salaries") {
                    fp.salaries = _.map(p.salaries, function (salary) { salary.amount /= 1000; return salary; });
                } else if (options.attrs[i] === "salariesTotal") {
                    fp.salariesTotal = _.reduce(fp.salaries, function (memo, salary) { return memo + salary.amount; }, 0);
                } else if (options.attrs[i] === "awardsGrouped") {
                    fp.awardsGrouped = [];
                    awardsGroupedTemp = _.groupBy(p.awards, function (award) { return award.type; });
                    for (award in awardsGroupedTemp) {
                        if (awardsGroupedTemp.hasOwnProperty(award)) {
                            fp.awardsGrouped.push({
                                type: award,
                                count: awardsGroupedTemp[award].length,
                                seasons: _.pluck(awardsGroupedTemp[award], "season")
                            });
                        }
                    }
                } else {
                    fp[options.attrs[i]] = p[options.attrs[i]];
                }
            }
        };

        // Copys/filters the ratings listed in options.ratings from p to fp.
        filterRatings = function (fp, p, options) {
            var cat, hasStats, i, j, k, kk, pr, tidTemp;

            if (options.season !== null) {
                // One season
                pr = null;
                for (j = 0; j < p.ratings.length; j++) {
                    if (p.ratings[j].season === options.season) {
                        pr = p.ratings[j];
                        break;
                    }
                }
                if (pr === null) {
                    // Must be retired, or not in the league yet
                    if (options.showRetired && p.tid === g.PLAYER.RETIRED) {
                        // If forcing to show retired players, blank it out
                        fp.ratings = {};
                        for (k = 0; k < options.ratings.length; k++) {
                            if (options.ratings[k] === "skills") {
                                fp.ratings[options.ratings[k]] = [];
                            } else {
                                fp.ratings[options.ratings[k]] = 0;
                            }
                        }
                        return true;
                    } else if (options.showRetired && (p.tid === g.PLAYER.UNDRAFTED || p.tid === g.PLAYER.UNDRAFTED_2 || p.tid === g.PLAYER.UNDRAFTED_3)) {
                        // What not show draft prospects too? Just for fun.
                        pr = p.ratings[0]; // Only has one entry
                    } else {
                        return false;
                    }
                }

                if (options.ratings.length > 0) {
                    fp.ratings = {};
                    for (k = 0; k < options.ratings.length; k++) {
                        fp.ratings[options.ratings[k]] = pr[options.ratings[k]];
                        if (options.ratings[k] === "dovr" || options.ratings[k] === "dpot") {
                            // Handle dovr and dpot - if there are previous ratings, calculate the fuzzed difference
                            cat = options.ratings[k].slice(1); // either ovr or pot
                            if (j > 0) {
                                fp.ratings[options.ratings[k]] = Math.round(helpers.bound(p.ratings[j][cat] + p.ratings[j].fuzz, 0, 100)) - Math.round(helpers.bound(p.ratings[j - 1][cat] + p.ratings[j - 1].fuzz, 0, 100));
                            } else {
                                fp.ratings[options.ratings[k]] = 0;
                            }
                        } else if (options.fuzz && options.ratings[k] !== "fuzz" && options.ratings[k] !== "season" && options.ratings[k] !== "skills" && options.ratings[k] !== "hgt") {
                            fp.ratings[options.ratings[k]] = Math.round(helpers.bound(fp.ratings[options.ratings[k]] + pr.fuzz, 0, 100));
                        }
                    }
                }
            } else {
                // All seasons
                fp.ratings = [];
                for (k = 0; k < p.ratings.length; k++) {
                    // If a specific tid was requested, only return ratings if a stat was accumulated for that tid
                    if (options.tid !== null) {
                        hasStats = false;
                        for (j = 0; j < p.stats.length; j++) {
                            if (options.tid === p.stats[j].tid && p.ratings[k].season === p.stats[j].season) {
                                hasStats = true;
                                break;
                            }
                        }
                        if (!hasStats) {
                            continue;
                        }
                    }

                    kk = fp.ratings.length; // Not always the same as k, due to hasStats filtering above
                    fp.ratings[kk] = {};
                    for (j = 0; j < options.ratings.length; j++) {
                        if (options.ratings[j] === "age") {
                            fp.ratings[kk].age = p.ratings[k].season - p.born.year;
                        } else if (options.ratings[j] === "abbrev") {
                            // Find the last stats entry for that season, and use that to determine the team
                            for (i = 0; i < p.stats.length; i++) {
                                if (p.stats[i].season === p.ratings[k].season && p.stats[i].playoffs === false) {
                                    tidTemp = p.stats[i].tid;
                                }
                            }
                            if (tidTemp >= 0) {
                                fp.ratings[kk].abbrev = helpers.getAbbrev(tidTemp);
                                tidTemp = undefined;
                            } else {
                                fp.ratings[kk].abbrev = null;
                            }
                        } else {
                            fp.ratings[kk][options.ratings[j]] = p.ratings[k][options.ratings[j]];
                            if (options.fuzz && options.ratings[j] !== "fuzz" && options.ratings[j] !== "season" && options.ratings[j] !== "skills" && options.ratings[j] !== "hgt") {
                                fp.ratings[kk][options.ratings[j]] = Math.round(helpers.bound(p.ratings[k][options.ratings[j]] + p.ratings[k].fuzz, 0, 100));
                            }
                        }
                    }
                }
            }

            return true;
        };

        // Returns stats object, containing properties "r" for regular season, "p" for playoffs, and "cr"/"cp" for career. "r" and "p" can be either objects (single season) or arrays of objects (multiple seasons). All these outputs are raw season totals, not per-game averages.
        gatherStats = function (p, options) {
            var ignoredKeys, j, key, ps;

            ps = {};

            if (options.stats.length > 0) {
                if (options.season !== null) {
                    // Single season
                    ps.r = {}; // Regular season
                    ps.p = {}; // Playoffs
                    if (options.tid !== null) {
                        // Get stats for a single team
                        for (j = 0; j < p.stats.length; j++) {
                            if (p.stats[j].season === options.season && p.stats[j].playoffs === false && p.stats[j].tid === options.tid) {
                                ps.r = p.stats[j];
                            }
                            if (options.playoffs && p.stats[j].season === options.season && p.stats[j].playoffs === true && p.stats[j].tid === options.tid) {
                                ps.p = p.stats[j];
                            }
                        }
                    } else {
                        // Get stats for all teams - eventually this should imply adding together multiple stats objects rather than just using the first?
                        for (j = 0; j < p.stats.length; j++) {
                            if (p.stats[j].season === options.season && p.stats[j].playoffs === false) {
                                ps.r = p.stats[j];
                            }
                            if (options.playoffs && p.stats[j].season === options.season && p.stats[j].playoffs === true) {
                                ps.p = p.stats[j];
                            }
                        }
                    }

                    // Load previous season if no stats this year and options.oldStats set
                    if (options.oldStats && _.isEmpty(ps.r)) {
                        for (j = 0; j < p.stats.length; j++) {
                            if (p.stats[j].season === g.season - 1 && p.stats[j].playoffs === false) {
                                ps.r = p.stats[j];
                            }
                            if (options.playoffs && p.stats[j].season === g.season - 1 && p.stats[j].playoffs === true) {
                                ps.p = p.stats[j];
                            }
                        }
                    }
                } else {
                    // Multiple seasons
                    ps.r = []; // Regular season
                    ps.p = []; // Playoffs
                    for (j = 0; j < p.stats.length; j++) {
                        // Save stats for the requested tid, or any tid if no tid was requested
                        if (options.tid === null || options.tid === p.stats[j].tid) {
                            if (p.stats[j].playoffs === false) {
                                ps.r.push(p.stats[j]);
                            } else if (options.playoffs) {
                                ps.p.push(p.stats[j]);
                            }
                        }
                    }

                    // Career totals
                    ps.cr = {}; // Regular season
                    ps.cp = {}; // Playoffs
                    if (ps.r.length > 0) {
                        // Aggregate annual stats and ignore other things
                        ignoredKeys = ["age", "playoffs", "season", "tid"];
                        for (key in ps.r[0]) {
                            if (ps.r[0].hasOwnProperty(key)) {
                                if (ignoredKeys.indexOf(key) < 0) {
                                    ps.cr[key] = _.reduce(_.pluck(ps.r, key), function (memo, num) { return memo + num; }, 0);
                                    if (options.playoffs) {
                                        ps.cp[key] = _.reduce(_.pluck(ps.p, key), function (memo, num) { return memo + num; }, 0);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return ps;
        };

        // Filters s by stats (which should be options.stats) and returns a filtered object. This is to do one season of stats filtering.
        filterStatsPartial = function (p, s, stats) {
            var j, row,difference,difference2;
			var singles,onbaseper,slugging;
			var fip,warPadj,warPrep,warP,wOBA,warHadj,warHrep,warH,warSadj,warSrep,warS,warF,warFadj,warFrep,warHFS,war;			
            row = {};
			
	//		console.log("p.pos: "+p.pos)
            if (!_.isEmpty(s) && s.gp > 0) {
                for (j = 0; j < stats.length; j++) {
                    if (stats[j] === "gp") {
                        row.gp = s.gp;
                    } else if (stats[j] === "fgAtRim") {     // converts SO to SO/9
					   if (s.fta==0) {
						row[stats[j]] = 0;
					   } else {
					   row[stats[j]] = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "trb") {     // batting average
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   row[stats[j]] = s.fg/s.fga;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "drb") {     // OBP
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   row[stats[j]] = ((s.fg+s.ast)/s.fga);
					   onbaseper = row[stats[j]];
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "ftp") {     // SLG
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   singles = s.fg-s.ft-s.orb-s.blk;
					   row[stats[j]] = ((singles+s.ft*2+s.orb*3+s.blk*4)/s.fga);
					   slugging = row[stats[j]];
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												
                    } else if (stats[j] === "tpp") {     // OPS
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {					   
					   singles = s.fg-s.ft-s.orb-s.blk;
					   onbaseper =  ((s.fg+s.ast)/s.fga);
					   slugging  = ((singles+s.ft*2+s.orb*3+s.blk*4)/s.fga);				   
					   row[stats[j]] = slugging+onbaseper;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												
                    } else if (stats[j] === "fgaMidRange") {     // FIP
					   if (s.fta==0) {
						row[stats[j]] = 0;
					   } else {					   
					   row[stats[j]] = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												

					} else if (stats[j] === "pf") {     // converts R to ERA
					   if (s.pf==0) {
						row[stats[j]] = 0;
					   } else {
					   row[stats[j]] = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "fgaAtRim") {     // converts BB to BB/9
					   if (s.fta==0) {
						row[stats[j]] = 0;
					   } else {
					   row[stats[j]] = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "babipP") {     // babipP not working right
					   if ((s.fta==0) || ((s.abP-s.fgAtRim-s.fgLowPost) <= 0)) {
						row[stats[j]] = 0;
					   } else {
					     difference = helpers.round(s.fgLowPost,3)-helpers.round(s.fgLowPost,0);
						 difference2 = helpers.round(s.fgAtRim,3)-helpers.round(s.fgAtRim,0);
						 if ((difference==0) && (difference2 == 0)) {
							row[stats[j]] = (s.drb-s.fgLowPost)/(s.abP-s.fgAtRim-s.fgLowPost)  ;
						} else if (difference == 0) {
							row[stats[j]] = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim-s.fgLowPost/9*s.fta)  ;						
						} else if (difference2 == 0) {
							row[stats[j]] = (s.drb-s.fgLowPost)/(s.abP-s.fgAtRim/9*s.fta-s.fgLowPost)  ;						
						} else {
							row[stats[j]] = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim/9*s.fta-s.fgLowPost/9*s.fta)  ;												
						}
//						row[stats[j]] = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim-s.fgLowPost/9*s.fta)  ;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "fgLowPost") {     // converts HR to HR/9
					   if (s.fta==0) {
						row[stats[j]] = 0;
					   } else {
						row[stats[j]] = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "gbp") {     // Percentage ground balls
					   if ((s.fta==0) || ((s.gb+s.ld+s.fb) <= 0)) {
						row[stats[j]] = 0;
					   } else {
						row[stats[j]] = s.gb/(s.gb+s.ld+s.fb);
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "fbp") {     // HR to fly balls
					   if ((s.fta==0) || (s.fb == 0)) {
						row[stats[j]] = 0;
					   } else {
						row[stats[j]] = s.fgLowPost/(s.fb);
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "babip") {     // babip
					   if ((s.fga==0) || ((s.fga-s.tov-s.blk) == 0)) {
						row[stats[j]] = 0;
					   } else {
//						row[stats[j]] = (s.fg-s.blk)/(s.fga-s.tov-s.blk)   ;
						row[stats[j]] = (s.fg-s.blk)/(s.fga-s.tov-s.blk)   ;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "warP") {     // warP
					   if (s.fta==0) {
						row[stats[j]] = 0;
					   } else {
					   

   					     fip = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
						 //warPadj = 6.00;
//						 warPadj = 8.00;
//						 warPadj = 6.00;
						 warPadj = 7.00;
//						 warPrep = 4.50
						 warPrep = 5.10
                         warP = (warPrep-fip)/9*s.fta/warPadj;
						 row[stats[j]] = warP;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;		
                    } else if (stats[j] === "ISO") {     // ISO
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   

						  row[stats[j]] = (s.ft*1 + s.orb*2 + s.blk*3) / (s.fga) ;
						 
//ISO = ((2B) + (2*3B) + (3*HR)) / AB
//ISO = Extra Bases / At-Bats 
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;		

						
                    } else if (stats[j] === "wOBA") {     // wOBA
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   

  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						row[stats[j]] = wOBA;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
						
                    } else if (stats[j] === "warH") {     // warH
					   if (s.fga==0) {
						row[stats[j]] = 0;
					   } else {
					   

  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						 
						 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
							 warHadj = 11.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.150;
						 
						 
						 } else {
	//						 warHadj = 7.00;
//							 warHadj = 8.00;
							 warHadj = 11.00;
	//						 warHrep = 0.2750;
//							 warHrep = 0.3200;
							 warHrep = 0.2800;
						 
						 }
						 
	                     warH = (wOBA-warHrep)*s.fga/warHadj;;
						row[stats[j]] = warH;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "warF") {     // warS
					   if (s.fieldAttempts==0) {
						row[stats[j]] = 0;
					   } else {
					   

						 warFadj = 9.00;
						 warFrep = 0.025;
						 warF = (s.errors/s.fieldAttempts-warFrep)*s.fieldAttempts/warFadj*(-1);
						 row[stats[j]] = warF;
						 
					   }
						
                    } else if (stats[j] === "warS") {     // warS
					   if (s.tpa==0) {
						row[stats[j]] = 0;
					   } else {
					   

						 warSadj = 15.00;
						 warSrep = 0.250;
						 warS = (s.tp/s.tpa-warSrep)*s.tpa/warSadj;
						 row[stats[j]] = warS;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
						
						
                    } else if (stats[j] === "war") {     // war
					   if (s.fga==0) {
							warH = 0;
					   
						//row[stats[j]] = 0;
					   } else {
					   

						 
  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						 
						 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
							 warHadj = 11.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.150;
						 
						 
						 } else {
	//						 warHadj = 7.00;
//							 warHadj = 8.00;
							 warHadj = 11.00;
	//											 
						 
							// warHadj = 8.00;
	//						 warHrep = 0.2750;
//							 warHrep = 0.3200;
							 warHrep = 0.2800;
						 }
	                     warH = (wOBA-warHrep)*s.fga/warHadj;
	
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
					   
						if (s.fta==0) {
							warP = 0;
						} else {
                       
							fip = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
//							warPadj = 10.00;
//							warPadj = 6.0;
//							warPadj = 8.0;
//							warPadj = 6.0;							
	//						warPrep = 4.50
							warPadj = 7.0;							
							warPrep = 5.10
							warP = (warPrep-fip)/9*s.fta/warPadj;
						}
							
						 //warbabip = (s.fg-s.blk)/(s.fga-s.tov-s.blk) ;
						 //warnormhits = (s.fga-s.tov-s.blk)*.300;
						 //warnormave = warnormhits+s.blk+s.orb+s.ft-s.tov+s.ast-s.fga+s.tp-s.tpa; // need to include errors
						 if (s.fieldAttempts == 0) {
							warF = 0;
						 } else {
//							warFadj = 20.00;
							warFadj = 9.00;
							warFrep = 0.025;
							warF = (s.errors/s.fieldAttempts-warFrep)*s.fieldAttempts/warFadj*(-1);
						 }					   

						if (s.tpa==0) {
							warS = 0;
						} else {
							warSadj = 15.00;
							warSrep = 0.250;
							warS = (s.tp/s.tpa-warSrep)*s.tpa/warSadj;
						}
						 warHFS = warH+warS+warF;
						 war = warHFS+warP;
						 row[stats[j]] = war;						 
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
					} else if (stats[j] === "gs") {
                        row.gs = s.gs;
                    } else if (stats[j] === "fgp") {
                        if (s.fga > 0) {
                            row.fgp = 100 * s.fg / s.fga;
                        } else {
                            row.fgp = 0;
                        }
                    } else if (stats[j] === "fgpAtRim") {
                        if (s.fgaAtRim > 0) {
                            row.fgpAtRim = 100 * s.fgAtRim / s.fgaAtRim;
                        } else {
                            row.fgpAtRim = 0;
                        }
                    } else if (stats[j] === "fgpLowPost") {
                        if (s.fgaLowPost > 0) {
                            row.fgpLowPost = 100 * s.fgLowPost / s.fgaLowPost;
                        } else {
                            row.fgpLowPost = 0;
                        }
                    } else if (stats[j] === "fgpMidRange") {
                        if (s.fgaMidRange > 0) {
                            row.fgpMidRange = 100 * s.fgMidRange / s.fgaMidRange;
                        } else {
                            row.fgpMidRange = 0;
                        }
                    } else if (stats[j] === "tpp") {
                        if (s.tpa > 0) {
                            row.tpp = 100 * s.tp / s.tpa;
                        } else {
                            row.tpp = 0;
                        }
                    } else if (stats[j] === "ftp") {
                        if (s.fta > 0) {
                            row.ftp = 100 * s.ft / s.fta;
                        } else {
                            row.ftp = 0;
                        }
                    } else if (stats[j] === "season") {
                        row.season = s.season;
                    } else if (stats[j] === "age") {
                        row.age = s.season - p.born.year;
                    } else if (stats[j] === "abbrev") {
                        row.abbrev = helpers.getAbbrev(s.tid);
                    } else if (stats[j] === "tid") {
                        row.tid = s.tid;
                    } else if (stats[j] === "per") {
                        row.per = s.per;
                    } else if (stats[j] === "ewa") {
                        row.ewa = s.ewa;
                    } else if (stats[j] === "yearsWithTeam" && !_.isEmpty(s)) {
                        // Everyone but players acquired in the offseason should be here
 
                        row.yearsWithTeam = s.yearsWithTeam;
                    } else {
                        if (options.totals) {
                            row[stats[j]] = s[stats[j]];
                        } else if (options.per36 && stats[j] !== "min") { // Don't scale min by 36 minutes						
                            row[stats[j]] = s[stats[j]] * 36 / s.min;
                        } else {
// don't scale by games played						
                            row[stats[j]] = s[stats[j]] ;
//                            row[stats[j]] = s[stats[j]] / s.gp;
                        }
                    }
                }
            } else {
                for (j = 0; j < stats.length; j++) {
                    if (stats[j] === "season") {
                        row.season = s.season;
                    } else if (stats[j] === "age") {
                        row.age = s.season - p.born.year;
                    } else if (stats[j] === "abbrev") {
                        row.abbrev = helpers.getAbbrev(s.tid);
                    } else if (stats[j] === "yearsWithTeam") {
                        row.yearsWithTeam = s.yearsWithTeam;
                    } else {
                        row[stats[j]] = 0;
                    }
                }
            }

            return row;
        };

        // Copys/filters the stats listed in options.stats from p to fp. If no stats are found for the supplied settings, then fp.stats remains undefined.
        filterStats = function (fp, p, options) {
            var i, ps;

            ps = gatherStats(p, options);

            // Always proceed for options.showRookies; proceed if we found some stats (checking for empty objects or lists); proceed if options.showNoStats
            if ((options.showRookies && p.draft.year >= g.season && (options.season === g.season || options.season === null)) || (!_.isEmpty(ps) && !_.isEmpty(ps.r)) || (options.showNoStats && (options.season > p.draft.year || options.season === null))) {
                if (options.season === null && options.stats.length > 0) {
                    if (!_.isEmpty(ps) && !_.isEmpty(ps.r)) {
                        // Multiple seasons, only show if there is data
                        fp.stats = [];
                        for (i = 0; i < ps.r.length; i++) {
                            fp.stats.push(filterStatsPartial(p, ps.r[i], options.stats));
                        }
                        if (options.playoffs) {
                            fp.statsPlayoffs = [];
                            for (i = 0; i < ps.p.length; i++) {
                                fp.statsPlayoffs.push(filterStatsPartial(p, ps.p[i], options.stats));
                            }
                        }
                    }

                    // Career totals
                    fp.careerStats = filterStatsPartial(p, ps.cr, options.stats);
                    // Special case for PER - weight by minutes per season
                    if (options.totals) {
                        fp.careerStats.per = _.reduce(ps.r, function (memo, psr) { return memo + psr.per * psr.min; }, 0) / (fp.careerStats.min);
                    } else {
                        fp.careerStats.per = _.reduce(ps.r, function (memo, psr) { return memo + psr.per * psr.min; }, 0) / (fp.careerStats.min * fp.careerStats.gp);
                    }
                    if (isNaN(fp.careerStats.per)) { fp.careerStats.per = 0; }
                    fp.careerStats.ewa = _.reduce(ps.r, function (memo, psr) { return memo + psr.ewa; }, 0); // Special case for EWA - sum
                    if (options.playoffs) {
                        fp.careerStatsPlayoffs = filterStatsPartial(p, ps.cp, options.stats);
                        fp.careerStatsPlayoffs.per = _.reduce(ps.p, function (memo, psp) { return memo + psp.per * psp.min; }, 0) / (fp.careerStatsPlayoffs.min * fp.careerStatsPlayoffs.gp); // Special case for PER - weight by minutes per season
                        if (isNaN(fp.careerStatsPlayoffs.per)) { fp.careerStatsPlayoffs.per = 0; }
                        fp.careerStatsPlayoffs.ewa = _.reduce(ps.p, function (memo, psp) { return memo + psp.ewa; }, 0); // Special case for EWA - sum
                    }
                } else if (options.stats.length > 0) { // Return 0 stats if no entry and a single year was requested, unless no stats were explicitly requested
                    // Single seasons
                    fp.stats = filterStatsPartial(p, ps.r, options.stats);
                    if (options.playoffs) {
                        if (!_.isEmpty(ps.p)) {
                            fp.statsPlayoffs = filterStatsPartial(p, ps.p, options.stats);
                        } else {
                            fp.statsPlayoffs = {};
                        }
                    }
                }

                return true;
            }
            return false;
        };

        fps = []; // fps = "filtered players"
        for (i = 0; i < p.length; i++) {
            fp = {};

            // Only add a player if filterStats finds something (either stats that season, or options overriding that check)
            if (filterStats(fp, p[i], options)) {
                // Only add a player if he was active for this season and thus has ratings for this season
                if (filterRatings(fp, p[i], options)) {
                    // This can never fail because every player has attributes
                    filterAttrs(fp, p[i], options);

                    fps.push(fp);
                }
            }
        }

        // Return an array or single object, based on the input
        return returnOnePlayer ? fps[0] : fps;
    }

    /**
     * Is a player worthy of the Hall of Fame?
     *
     * This calculation is based on http://espn.go.com/nba/story/_/id/8736873/nba-experts-rebuild-springfield-hall-fame-espn-magazine except it uses PER-based estimates of wins added http://insider.espn.go.com/nba/hollinger/statistics (since PER is already calculated for each season) and it includes each playoff run as a separate season.
     *
     * @memberOf core.player
     * @param {Object} p Player object.
     * @return {boolean} Hall of Fame worthy?
     */
    function madeHof(p, playerStats) {
        var df, ewa, ewas, fudgeSeasons, i, mins, pers, prls, va,war;

		var fip,fgLowPost,fgaAtRim,fgAtRim,fta,warPadj,warPrep,warP;
		var warF,warFadj,warFrep,fieldAttempts,errors;
		var warH,singles,wOBA,warHadj,warHrep,ast,ft,orb,blk,fga;
		var warS,warSadj,warSrep,tp,tpa;
		var gp;
		var warHFS;
		var fg;
	/*	filter(p);
		p = player.filter(event.target.result, {
                    attrs: ["pid", "name", "tid", "abbrev", "teamRegion", "teamName", "pos", "age", "hgtFt", "hgtIn", "weight", "born", "contract", "draft", "face", "mood", "injury", "salaries", "salariesTotal", "awardsGrouped", "freeAgentMood", "imgURL", "watch"],
                    ratings: ["season", "abbrev", "age", "ovr", "pot", "hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "blk", "stl", "drb", "pss", "reb", "skills"],
                    stats: ["season", "abbrev", "age", "gp", "gs", "min", "fg", "fga", "fgp", "fgAtRim", "fgaAtRim", "fgpAtRim", "fgLowPost", "fgaLowPost", "fgpLowPost", "fgMidRange", "fgaMidRange", "fgpMidRange", "tp", "tpa", "tpp", "ft", "fta", "ftp", "orb", "drb", "trb", "ast", "tov", "stl", "blk", "pf", "pts", "per", "ewa","winP","lossP","save","ld","fb","gb","gbp","fbp","abP","babip","babipP","war","warS","warH","warHF","warF","warP","wOBA","ISO","errors","fieldAttempts"],
                    playoffs: true,
                    showNoStats: true,
                    showRookies: true,
                    fuzz: true
        });*/
        fgLowPost = _.pluck(playerStats, "fgLowPost");
        fgaAtRim = _.pluck(playerStats, "fgaAtRim");
        fgAtRim = _.pluck(playerStats, "fgAtRim");
        fta = _.pluck(playerStats, "fta");
        fieldAttempts = _.pluck(playerStats, "fieldAttempts");
        errors = _.pluck(playerStats, "errors");
        ast = _.pluck(playerStats, "ast");
        ft = _.pluck(playerStats, "ft");
        orb = _.pluck(playerStats, "orb");
        blk = _.pluck(playerStats, "blk");
        fga = _.pluck(playerStats, "fga");
        tp = _.pluck(playerStats, "tp");
        tpa = _.pluck(playerStats, "tpa");
        gp = _.pluck(playerStats, "gp");
        fg = _.pluck(playerStats, "fg");
		
		
		
//        war = _.pluck(p.stats, "war");
      //  pers = _.pluck(p.stats, "per");


/*							fip = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
//							warPadj = 10.00;
							warPadj = 6.00;
							warPrep = 4.50
							warP = (warPrep-fip)/9*s.fta/warPadj; */
/*
						 if (s.fieldAttempts == 0) {
							warF = 0;
						 } else {
//							warFadj = 20.00;
							warFadj = 9.00;
							warFrep = 0.025;
							warF = (s.errors/s.fieldAttempts-warFrep)*s.fieldAttempts/warFadj*(-1);
						 }
						 
  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						 
						 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
							 warHadj = 8.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.150;
						 
						 
						 } else {
	//						 warHadj = 7.00;
							 warHadj = 8.00;
	//											 
						 
							// warHadj = 8.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.3200;
						 }
	                     warH = (wOBA-warHrep)*s.fga/warHadj;
						if (s.tpa==0) {
						 warS = 0;
						} else {
						 warSadj = 15.00;
						 warSrep = 0.250;
						 warS = (s.tp/s.tpa-warSrep)*s.tpa/warSadj;
						}
						 warHFS = warH+warS+warF;
						 war = warHFS+warP;
						 row[stats[j]] = war;*/							




	  
	  
	  
        // Position Replacement Levels http://insider.espn.go.com/nba/hollinger/statistics
        prls = {
            PG: 11,
            G: 10.75,
            SG: 10.5,
            GF: 10.5,
            SF: 10.5,
            F: 11,
            PF: 11.5,
            FC: 11.05,
            C: 10.6
        };

        // Estimated wins added for each season http://insider.espn.go.com/nba/hollinger/statistics
        ewas = [];
		//console.log("war.length: "+ war.length);
		
        for (i = 0; i < gp.length; i++) {
//				console.log("i: "+i+" war[i]: "+ war[i]);		   

					   if (fga[i]==0) {
							warH = 0;
					   } else {

  					     singles = fg[i]-ft[i]-orb[i]-blk[i];
						 wOBA = (0.691*ast[i] + 0.884*singles + 1.257*ft[i] + 1.593*orb[i] + 2.058*blk[i]) / (fga[i] + ast[i] ) ;
						 


						 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
							 warHadj = 11.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.150;
						 
						 
						 } else {
	//						 warHadj = 7.00;
							 warHadj = 11.00;
	//											 
						 
							// warHadj = 8.00;
	//						 warHrep = 0.2750;
							 warHrep = 0.28;
						 }
	                     warH = (wOBA-warHrep)*fga[i]/warHadj;
					   
					   
					   }

						if (fta[i] > 0) {
							fip = ((13*fgLowPost[i])+(3*(fgaAtRim[i]))-(2*fgAtRim[i]))/fta[i] + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
							//warPadj = 8.00;
							//warPadj = 6.00;							
							//warPrep = 4.50
							warPadj = 7.00;							
							warPrep = 5.10							
							warP = (warPrep-fip)/9*fta[i]/warPadj; 
						} else {
						  warP = 0;
						}
						 if (fieldAttempts[i] == 0) {
							warF = 0;
						 } else {
//							warFadj = 20.00;
							warFadj = 9.00;
							warFrep = 0.025;
							warF = (errors[i]/fieldAttempts[i]-warFrep)*fieldAttempts[i]/warFadj*(-1);
						 }
						 
						 
						if (tpa[i]==0) {
						 warS = 0;
						} else {
						 warSadj = 15.00;
						 warSrep = 0.250;
						 warS = (tp[i]/tpa[i]-warSrep)*tpa[i]/warSadj;
						}						
						
						 warHFS = warH+warS+warF;
						 war = warHFS+warP;

            va = war;
		//	console.log("war: "+war+" warH: "+warH+" warF: "+ warF+" warP: "+ warP);
		//	console.log("tp[i]: "+tp[i]+" tpa[i]: "+tpa[i]+" singles: "+ singles+" ft[i]: "+ ft[i]+" orb[i]: "+ orb[i]+" blk[i]: "+ blk[i]+" ast[i]: "+ ast[i]+" fga[i]: "+ fga[i]+" fta[i]: "+ fta[i]+" fta[i]: "+ fta[i]+" fgAtRim[i]: "+ fgAtRim[i]+" fgaAtRim[i]: "+ fgaAtRim[i]+" fgLowPost[i]: "+ fgLowPost[i]);

//            va = war[i];
            ewas.push(va); // 0.8 is a fudge factor to approximate the difference between (in-game) EWA and (real) win shares
        }
//console.log(ewas)
//console.log(_.pluck(p.stats, "ewa"))

        // Calculate career EWA and "dominance factor" DF (top 5 years EWA - 50)
        ewas.sort(function (a, b) { return b - a; }); // Descending order
        ewa = 0;
//        df = -50;
        df = -15;
		
        for (i = 0; i < ewas.length; i++) {
//		console.log("i: "+ i +"ewas: "+ewas[i]);
		
            ewa += ewas[i];
            if (i < 5) {
                df += ewas[i];
            }
        }

        // Fudge factor for players generated when the league started
        fudgeSeasons = g.startingSeason - p.draft.year - 5;
        if (fudgeSeasons > 0) {
            ewa += ewas[0] * fudgeSeasons;
        }
	//	console.log("ewa: "+ewa+" df: "+df);	     
		console.log("war: "+war+" warH: "+warH+" warF: "+ warF+" warP: "+ warP);
		console.log("ewa: "+ewa+" df: "+df+" fudgeSeasons: "+ fudgeSeasons+" p.draft.year: "+ p.draft.year);
        // Final formula
        if (ewa + df > 75) {
            return true;
        }

        return false;
    }

	
	
	
    /**
     * Returns a numeric value for a given player, representing is general worth to a typical team
     * (i.e. ignoring how well he fits in with his teammates and the team's strategy/finances). It
     * is similar in scale to the overall and potential ratings of players (0-100), but it is based
     * on stats in addition to ratings. The main components are:
     *
     * 1. Recent stats: Avg of last 2 seasons' PER if min > 2000. Otherwise, scale by min / 2000 and
     *     use ratings to estimate the rest.
     * 2. Potential for improvement (or risk for decline): Based on age and potential rating.
     *
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {Object=} options Object containing several optional options:
     *     noPot: When true, don't include potential in the value calcuation (useful for roster
     *         ordering and game simulation). Default false.
     *     fuzz: When true, used fuzzed ratings (useful for roster ordering, draft prospect
     *         ordering). Default false.
     * @return {boolean} Value of the player, usually between 50 and 100 like overall and potential
     *     ratings.
     */
    function valueBatting(p, options) {
        var age, current, i, potential, pr, ps, ps1, ps2, s, worth, worthFactor;
		var ratingKeys;
        options = options !== undefined ? options : {};
        options.noPot = options.noPot !== undefined ? options.noPot : false;
        options.fuzz = options.fuzz !== undefined ? options.fuzz : false;
        options.withContract = options.withContract !== undefined ? options.withContract : false;

        // Current ratings
        pr = {}; // Start blank, add what we need (efficiency, wow!)
        s = p.ratings.length - 1; // Latest season

		
		ratingKeys = ['ins','dnk','fg'];
		current = 0;
        // Fuzz?
        if (options.fuzz) {
            pr.ovr = Math.round(helpers.bound(p.ratings[s].ovr + p.ratings[s].fuzz, 0, 100));
			
            for (j = 0; j < ratingKeys.length; j++) {
			    if (j==0) {
                current += p.ratings[r][ratingKeys[j]]*2;
				} else if (j==1) {
                current += p.ratings[r][ratingKeys[j]];
				} else if (j==2) {
                current += p.ratings[r][ratingKeys[j]]*4;
				}
            }
			//if (p.ratings[r]['ins'])
			// formula that ranks a team
			// use excel to test  ins*dnk*2+dnk*fg+dnk*2+fg
			
        } else {
            pr.ovr = p.ratings[s].ovr;
        }

		
		
/*		
            // Easy to improve
            ratingKeys = ['hgt','stre','spd','jmp', 'endu', 'ins', 'drb', 'pss', 'reb'];
            for (j = 0; j < ratingKeys.length; j++) {
                p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + random.gauss(2, 2) * baseChange);
            }
            // In between
            ratingKeys = ['tp', 'dnk','stl'];
            for (j = 0; j < ratingKeys.length; j++) {
                p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -100, 35));
            }
            // Hard to improve
            ratingKeys = ['blk', 'fg', 'ft'];
            for (j = 0; j < ratingKeys.length; j++) {
                p.ratings[r][ratingKeys[j]] = limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
//                p.ratings[r][ratingKeys[j]] = limitrating.limitRating(p.ratings[r][ratingKeys[j]] + helpers.bound(random.gauss(1, 2) * baseChange, -10, 20));
            }
	*/	
		
		
		
		
        // Regular season stats ONLY, in order starting with most recent


        // 1. Account for stats (and current ratings if not enough stats)
        current = pr.ovr; // No stats at all? Just look at ratings more, then.
		
            return current;

    }
	
	
    /**
     * Returns a numeric value for a given player, representing is general worth to a typical team
     * (i.e. ignoring how well he fits in with his teammates and the team's strategy/finances). It
     * is similar in scale to the overall and potential ratings of players (0-100), but it is based
     * on stats in addition to ratings. The main components are:
     *
     * 1. Recent stats: Avg of last 2 seasons' PER if min > 2000. Otherwise, scale by min / 2000 and
     *     use ratings to estimate the rest.
     * 2. Potential for improvement (or risk for decline): Based on age and potential rating.
     *
     * @memberOf core.player
     * @param {Object} p Player object.
     * @param {Array.<Object>} Array of playerStats objects, regular season only, starting with most recent. Only the first 1 or 2 will be used.
     * @param {Object=} options Object containing several optional options:
     *     noPot: When true, don't include potential in the value calcuation (useful for roster
     *         ordering and game simulation). Default false.
     *     fuzz: When true, used fuzzed ratings (useful for roster ordering, draft prospect
     *         ordering). Default false.
     *     age: If set, override the player's real age. This is only useful for draft prospects,
     *         because you can use the age they will be at the draft.
     * @return {boolean} Value of the player, usually between 50 and 100 like overall and potential
     *     ratings.
     */
    function value(p, ps, options) {
        var age, current, i, potential, pr, ps, ps1, ps2, s, worth, worthFactor;

        options = options !== undefined ? options : {};
        options.noPot = options.noPot !== undefined ? options.noPot : false;
        options.fuzz = options.fuzz !== undefined ? options.fuzz : false;
        options.age = options.age !== undefined ? options.age : null;
        options.withContract = options.withContract !== undefined ? options.withContract : false;


		if (ps === undefined) { console.log("NO STATS"); ps = []; }		

        // Current ratings
        pr = {}; // Start blank, add what we need (efficiency, wow!)
        s = p.ratings.length - 1; // Latest season

        // Fuzz?
        if (options.fuzz) {
            pr.ovr = Math.round(helpers.bound(p.ratings[s].ovr + p.ratings[s].fuzz, 0, 100));
            pr.pot = Math.round(helpers.bound(p.ratings[s].pot + p.ratings[s].fuzz, 0, 100));
        } else {
            pr.ovr = p.ratings[s].ovr;
            pr.pot = p.ratings[s].pot;
        }


        // 1. Account for stats (and current ratings if not enough stats)
        current = pr.ovr; // No stats at all? Just look at ratings more, then.
		
		// for now, just use ratings, time left, and potential
    /*    if (ps.length > 0) {
            if (ps.length === 1) {
                // Only one year of stats
                current = 3.75 * ps[0].per;
                if (ps[0].min < 2000) {
                    current = current * ps[0].min / 2000 + pr.ovr * (1 - ps[0].min / 2000);
                }
            } else {
                // Two most recent seasons
                ps1 = ps[0];
                ps2 = ps[1];
                if (ps1.min + ps2.min > 0) {
                    current = 3.75 * (ps1.per * ps1.min + ps2.per * ps2.min) / (ps1.min + ps2.min);
                }
                if (ps1.min + ps2.min < 2000) {
                    current = current * (ps1.min + ps2.min) / 2000 + pr.ovr * (1 - (ps1.min + ps2.min) / 2000);
                }
            }
            current = 0.1 * pr.ovr + 0.9 * current; // Include some part of the ratings
        }*/

        // Short circuit if we don't care about potential
        if (options.noPot) {
            return current;
        }

        // 2. Potential
        potential = pr.pot;

        // If performance is already exceeding predicted potential, just use that
        if (current >= potential && age < 29) {
            return current;
        }

        // Otherwise, combine based on age
        if (p.draft.year > g.season) {
            // Draft prospect
            age = p.draft.year - p.born.year;
        } else {
            age = g.season - p.born.year;
        }
       if (age <= 19) {
            return 0.5 * potential + 0.5 * current;
        }
        if (age === 20) {
            return 0.45 * potential + 0.55 * current;
        }
        if (age === 21) {
            return 0.4 * potential + 0.6 * current;
        }
        if (age === 22) {
            return 0.3 * potential + 0.7 * current;
        }
        if (age === 23) {
            return 0.2 * potential + 0.8 * current;
        }
        if (age === 24) {
            return 0.1 * potential + 0.9 * current;
        }
        if (age === 25) {
            return 0.05 * potential + 0.95 * current;
        }
        if (age > 25 && age < 29) {
            return current;
        }
        if (age === 29) {
            return 0.975 * current;
        }
        if (age === 30) {
            return 0.95 * current;
        }
        if (age === 31) {
            return 0.9 * current;
        }
        if (age === 32) {
            return 0.85 * current;
        }
        if (age === 33) {
            return 0.8 * current;
        }
        if (age > 33) {
            return 0.7 * current;
        }
    }

        // ps: player stats objects, regular season only, most recent first
    // Currently it is assumed that ps, if passed, will be the latest season. This assumption could be easily relaxed if necessary, just might make it a bit slower
    function updateValues(ot, p, ps) {
        return Promise.try(function () {
            var season;

            // Require up to the two most recent regular season stats entries, unless the current season has 2000+ minutes
            if (ps.length === 0 || (ps.length === 1 && ps[0].min < 2000)) {
                // Start search for past stats either at this season or at the most recent ps season
                // This assumes ps[0].season is the most recent entry for this player!
                if (ps.length === 0) {
                    season = g.season;
                } else {
                    season = ps[0].season - 1;
                }

                // New player objects don't have pids let alone stats, so just skip
                if (!p.hasOwnProperty("pid")) {
                    return;
                }

                // Start at season and look backwards until we hit
                // This will not work totally right if a player played for multiple teams in a season. It should be ordered by psid, instead it's ordered by tid because of the index used
                return dao.playerStats.iterate({
                    ot: ot,
                    index: "pid, season, tid",
                    key: IDBKeyRange.bound([p.pid, 0], [p.pid, season + 1]),
                    direction: "prev",
                    callback: function (psTemp, shortCircuit) {
                        // Skip playoff stats
                        if (psTemp.playoffs) {
                            return;
                        }

                        // Store stats
                        ps.push(psTemp);

                        // Continue only if we need another row
                        if (ps.length === 1 && ps[0].min < 2000) {
                            shortCircuit();
                        }
                    }
                });
            }
        }).then(function () {
            p.value = value(p, ps);
            p.valueNoPot = value(p, ps, {noPot: true});
            p.valueFuzz = value(p, ps, {fuzz: true});
            p.valueNoPotFuzz = value(p, ps, {noPot: true, fuzz: true});
            p.valueWithContract = value(p, ps, {withContract: true});

            return p;
        });
    }
	
    /**
     * Have a player retire, including all event and HOF bookkeeping.
     *
     * This just updates a player object. You need to write it to the database after.
     * 
     * @memberOf core.player
     * @param {IDBTransaction} ot An IndexedDB transaction on events.
     * @param {Object} p Player object.
     * @return {Object} p Updated (retired) player object.
     */
    function retire(tx, p, playerStats) {
        eventLog.add(tx, {
            type: "retired",
            text: '<a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a>  retired.',
            showNotification: p.tid === g.userTid,
            pids: [p.pid],
            tids: [p.tid]
        });

        p.tid = g.PLAYER.RETIRED;
        p.retiredYear = g.season;

        // Add to Hall of Fame?
        if (madeHof(p, playerStats)) {
            p.hof = true;
            p.awards.push({season: g.season, type: "Inducted into the Hall of Fame"});
            eventLog.add(tx, {
                type: "hallOfFame",
                text: '<a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a> was inducted into the <a href="' + helpers.leagueUrl(["hall_of_fame"]) + '">Hall of Fame</a>.',
                showNotification: p.statsTids.indexOf(g.userTid) >= 0,
                pids: [p.pid],
                tids: p.statsTids
            });
        }

        return p;
    }


    /**
     * How many seasons are left on this contract? The answer can be a fraction if the season is partially over
     * 
     * @memberOf core.player
     * @param {Object} exp Contract expiration year.
     * @return {number} numGamesRemaining Number of games remaining in the current season (0 to 82).
     */
    function contractSeasonsRemaining(exp, numGamesRemaining) {
        return (exp - g.season) + numGamesRemaining / 82;
    }

    // See views.negotiation for moods as well
    function moodColorText(p) {
        if (p.freeAgentMood[g.userTid] < 0.25) {
            return {
                color: "#5cb85c",
                text: 'Eager to reach an agreement.'
            };
        }

        if (p.freeAgentMood[g.userTid] < 0.5) {
            return {
                color: "#ccc",
                text: 'Willing to sign for the right price.'
            };
        }

        if (p.freeAgentMood[g.userTid] < 0.75) {
            return {
                color: "#f0ad4e",
                text: 'Annoyed at you.'
            };
        }

        return {
            color: "#d9534f",
            text: 'Insulted by your presence.'
        };
    }

    /**
     * Take a partial player object, such as from an uploaded JSON file, and add everything it needs to be a real player object.
     *
     * This doesn't add the things from player.updateValues!
     * 
     * @memberOf core.player
     * @param {Object} p Partial player object.
     * @return {Object} p Full player object.
     */
    function augmentPartialPlayer(p, scoutingRank) {
        var age, i, pg, simpleDefaults;

        if (!p.hasOwnProperty("born")) {
            age = random.randInt(17, 35);
        } else {
            age = g.startingSeason - p.born.year;
        }

        // This is used to get at default values for various attributes
        pg = generate(p.tid, age, "", 0, 0, g.startingSeason - age, true, scoutingRank);

        // Optional things
        simpleDefaults = ["awards", "born", "college", "contract", "draft", "face", "freeAgentMood", "gamesUntilTradable", "hgt", "hof", "imgURL", "injury", "pos", "ptModifier", "retiredYear", "rosterOrder", "weight", "watch", "yearsFreeAgent"];
        for (i = 0; i < simpleDefaults.length; i++) {
            if (!p.hasOwnProperty(simpleDefaults[i])) {
                p[simpleDefaults[i]] = pg[simpleDefaults[i]];
            }
        }
        if (!p.hasOwnProperty("salaries")) {
            p.salaries = [];
            if (p.contract.exp < g.startingSeason) {
                p.contract.exp = g.startingSeason;
            }
            if (p.tid >= 0) {
                p = setContract(p, p.contract, true);
            }
        }
        if (!p.hasOwnProperty("stats")) {
            p.stats = [];
        }		
        if (!p.hasOwnProperty("statsTids")) {
            p.statsTids = [];
            if (p.tid >= 0 && g.phase <= g.PHASE.PLAYOFFS) {
                p.statsTids.push(p.tid);
            }
        }
        if (!p.ratings[0].hasOwnProperty("fuzz")) {
            p.ratings[0].fuzz = pg.ratings[0].fuzz;
        }
        if (!p.ratings[0].hasOwnProperty("skills")) {
            p.ratings[0].skills = skills(p.ratings[0]);
        }
        if (!p.ratings[0].hasOwnProperty("ovr")) {
            p.ratings[0].ovr = playerSport.ovr(p.ratings[0]);
        }
        if (p.ratings[0].pot < p.ratings[0].ovr) {
            p.ratings[0].pot = p.ratings[0].ovr;
        }

        // Fix always-missing info
        if (p.tid === g.PLAYER.UNDRAFTED_2) {
            p.ratings[0].season = g.startingSeason + 1;
        } else if (p.tid === g.PLAYER.UNDRAFTED_3) {
            p.ratings[0].season = g.startingSeason + 2;
        } else {
            if (!p.ratings[0].hasOwnProperty("season")) {
                p.ratings[0].season = g.startingSeason;
            }
        }


        return p;
    }
			
	
    function checkStatisticalFeat(tx, pid, tid, p, results) {
        var cycle, feat, featText, featTextArr, i, j, k, key, logFeat, saveFeat, statArr, won;

        saveFeat = false;

        logFeat = function (text) {
            eventLog.add(tx, {
                type: "playerFeat",
                text: text,
                showNotification: tid === g.userTid,
                pids: [pid],
                tids: [tid]
            });
        };

        cycle = ["ft", "orb", "blk"].reduce(function (count, stat) {
            if (p.stat[stat] >= 1) {
                return count + 1;
            }
            return count;
        }, 0);
        if (p.stat.fg - p.stat.ft - p.stat.orb - p.stat.blk >= 1) {
            cycle += 1;
        }

        statArr = {};
   /*     if (p.stat.pts >= 5 && p.stat.ast >= 5 && p.stat.stl >= 5 && p.stat.blk >= 5 && (p.stat.orb + p.stat.drb) >= 5) {
            statArr.points = p.stat.pts;
            statArr.rebounds = p.stat.orb + p.stat.drb;
            statArr.assists = p.stat.ast;
            statArr.steals = p.stat.stl;
            statArr.blocks = p.stat.blk;
            saveFeat = true;
        }*/
        if (cycle >= 4) {
            statArr.singles = p.stat.fg - p.stat.ft - p.stat.orb - p.stat.blk; 
            statArr.doubles = p.stat.ft;
            statArr.triples = p.stat.orb; 
            statArr.homeruns = p.stat.blk; 
            saveFeat = true;
        }
				
		// perfect game, at least 4 hits
       /* if ((p.stat.fg >= 4) && (p.stat.fga - p.stat.fg <= 0 )) {
            statArr.hits = p.stat.fg;
            statArr.atbats = p.stat.fga;
            saveFeat = true;
        }*/		
		// multiple home runs
        if (p.stat.blk >= 2) {
            statArr["home runs"] = p.stat.blk;
            saveFeat = true;
        }		
        if (p.stat.tp >= 3) {
            statArr.steals = p.stat.tp;
            saveFeat = true;
        }				
        if (p.stat.pts >= 4) {
            statArr.runs = p.stat.pts;
            saveFeat = true;
        }	
        if (p.stat.stl >= 6) {
            statArr.RBIs = p.stat.stl;
            saveFeat = true;
        }				
		
/*        if (p.stat.blk >= 2) {
            statArr.homeruns = p.stat.blk;
            saveFeat = true;
        }		
        if (p.stat.blk >= 2) {
            statArr.homeruns = p.stat.blk;
            saveFeat = true;
        }*/
		// complete game no runs
        if ((p.stat.fta >= 7) && (p.stat.pf == 0)) {
            statArr.innings = p.stat.fta;
            statArr["earned runs"] = p.stat.pf;			
            saveFeat = true;
        }
		// comploete game shutout
        if ((p.stat.fta >= 7) && (p.stat.pfE == 0)) {
            statArr.innings = Math.round(p.stat.fta*100)/100;
            statArr.runs = p.stat.pfE;			
            saveFeat = true;
        }		
        if ((p.stat.fta >= 7) && (p.stat.drb == 0)) {
            statArr.innings = Math.round(p.stat.fta*100)/100;
            statArr.hits = p.stat.drb;			
            saveFeat = true;
        }		
		// perfect game
        if ((p.stat.fta >= 7) && (p.stat.drb == 0) && (p.stat.fgaAtRim == 0) ) {
            statArr.innings = Math.round(p.stat.fta*100)/100;
            statArr.hits = p.stat.drb;			
            statArr.walks = p.stat.fgaAtRim;				
            statArr.runs = p.stat.pfE;				
            statArr["strike outs"] = p.stat.fgAtRim;				
            saveFeat = true;
        }				
		// greater than 10 strike outs
        if ((p.stat.fgAtRim >= 10)) {
            statArr.innings = Math.round(p.stat.fta*100)/100;
            statArr["strike outs"] = p.stat.fgAtRim;				
            saveFeat = true;
        }


        if (saveFeat) {
            if (results.team[0].id === tid) {
                i = 0;
                j = 1;
            } else {
                i = 1;
                j = 0;
            }

            if (results.team[i].stat.pts > results.team[j].stat.pts) {
                won = true;
            } else {
                won = false;
            }

            featTextArr = [];
            for (key in statArr) {
                if (statArr.hasOwnProperty(key)) {
                    featTextArr.push(statArr[key] + " " + key);
                }
            }

            featText = '<a href="' + helpers.leagueUrl(["player", pid]) + '">' + p.name + '</a> had <a href="' + helpers.leagueUrl(["game_log", g.teamAbbrevsCache[tid], g.season, results.gid]) + '">';
            for (k = 0; k < featTextArr.length; k++) {
                if (featTextArr.length > 1 && k === featTextArr.length - 1) {
                    featText += " and ";
                }

                featText += featTextArr[k];

                if (featTextArr.length > 2 && k < featTextArr.length - 2) {
                    featText += ", ";
                }
            }
            featText += '</a> in a ' + results.team[i].stat.pts + "-" + results.team[j].stat.pts + (won ? ' win over the ' : ' loss to the ') + g.teamNamesCache[results.team[j].id] + '.';

            logFeat(featText);

            feat = {
                pid: pid,
                name: p.name,
                pos: p.pos,
                season: g.season,
                tid: tid,
                oppTid: results.team[j].id,
                playoffs: g.phase === g.PHASE.PLAYOFFS,
                gid: results.gid,
                stats: p.stat,
                won: won,
                score: results.team[i].stat.pts + "-" + results.team[j].stat.pts,
                overtimes: results.overtimes
            };

            dao.playerFeats.add({ot: tx, value: feat});
        }
    }	
	
    return {

        limitRating: limitRating,
        addRatingsRow: addRatingsRow,
        addStatsRow: addStatsRow,
        genBaseMoods: genBaseMoods,
        addToFreeAgents: addToFreeAgents,
        bonus: bonus,
        genContract: genContract,
        setContract: setContract,
        develop: develop,
        injury: injury,
        generate: generate,
        ovr: playerSport.ovr,
        release: release,
        skills: playerSport.skills,
        filter: filter,
        madeHof: madeHof,
        //value: value,
        updateValues: updateValues,
        retire: retire,
        name: name,
        contractSeasonsRemaining: contractSeasonsRemaining,
        moodColorText: moodColorText,
        augmentPartialPlayer: augmentPartialPlayer,
        checkStatisticalFeat: checkStatisticalFeat
    };
});