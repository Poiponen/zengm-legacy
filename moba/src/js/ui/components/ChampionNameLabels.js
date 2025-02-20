// @flow

import React from 'react';
import {helpers} from '../../common';
import SkillsBlock from './SkillsBlock';
import WatchBlock from './WatchBlock';
import ChampionPopover from './ChampionPopover';
import type {PlayerInjury, PlayerSkill} from '../../common/types';

const PlayerNameLabels = ({children, injury, pid, skills, style, watch}: {
    children: string,
    injury?: PlayerInjury,
    pid: number,
    skills?: PlayerSkill[],
    style?: {[key: string]: string},
    watch?: boolean | Function, // For Firefox's Object.watch
}) => {
    let injuryIcon = null;
    if (injury !== undefined) {
        if (injury.gamesRemaining > 0) {
            const title = `${injury.type} (out ${injury.gamesRemaining} more games)`;
            injuryIcon = <span className="label label-danger label-injury" title={title}>{injury.gamesRemaining}</span>;
        } else if (injury.gamesRemaining === -1) {
            // This is used in box scores, where it would be confusing to display "out X more games" in old box scores
            injuryIcon = <span className="label label-danger label-injury" title={injury.type}>&nbsp;</span>;
        }
    }

    return <span style={style}>
		{children}
        {injuryIcon}
        <SkillsBlock skills={skills} />
        <ChampionPopover pid={pid} />
        {typeof watch === 'boolean' ? <WatchBlock pid={pid} watch={watch} /> : null}
    </span>;
};
PlayerNameLabels.propTypes = {
    children: React.PropTypes.any,
    injury: React.PropTypes.shape({
        gamesRemaining: React.PropTypes.number.isRequired,
        type: React.PropTypes.string.isRequired,
    }),
    pid: React.PropTypes.number.isRequired,
    skills: React.PropTypes.arrayOf(React.PropTypes.string),
    style: React.PropTypes.object,
    watch: React.PropTypes.oneOfType([
        React.PropTypes.bool,
        React.PropTypes.func, // For Firefox's Object.watch
    ]),
};

export default PlayerNameLabels;
