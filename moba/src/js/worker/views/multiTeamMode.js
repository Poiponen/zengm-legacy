// @flow

import {g} from '../../common';
import type {GetOutput, UpdateEvents} from '../../common/types';

async function updateMultiTeamMode(
    inputs: GetOutput,
    updateEvents: UpdateEvents,
): void | {[key: string]: any} {
    if (updateEvents.includes('firstRun') || updateEvents.includes('g.userTids')) {
        const teams = [];
        for (let i = 0; i < g.numTeams; i++) {
            teams.push({
                tid: i,
                name: `${g.teamRegionsCache[i]}`,
            });
        }

        return {
            userTids: g.userTids,
            teams,
        };
    }
}

export default {
    runBefore: [updateMultiTeamMode],
};
