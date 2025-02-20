// @flow

import React from 'react';
import OverlayTrigger from 'react-bootstrap/lib/OverlayTrigger';
import Popover from 'react-bootstrap/lib/Popover';
import {toWorker} from '../util';

const colorRating = (rating: number, type?: 'ovr') => {
    const classes = ['text-danger', 'text-warning', null, 'text-success'];

    // Different cutoffs for ovr and other ratings, cause it's not fair to expect excellence in all areas!
    let cutoffs = [30, 60, 80, Infinity];
    if (type === 'ovr') {
        cutoffs = [30, 45, 60, Infinity];
    }


    const ind = cutoffs.findIndex((cutoff) => rating < cutoff);
    return classes[ind];
};


type Props = {
    pid: number,
};

type State = {
    ratings: {
        ovr: number,
        pot: number,
        hgt: number,
        stre: number,
        spd: number,
        jmp: number,
        endu: number,
        ins: number,
        dnk: number,
        ft: number,
        fg: number,
        tp: number,
        blk: number,
        stl: number,
        drb: number,
        pss: number,
        reb: number,
    } | void,
    stats: {
        pts: number,
        trb: number,
        ast: number,
        blk: number,
        stl: number,
        tov: number,
        min: number,
        per: number,
        ewa: number,
    } | void,
};

class RatingsStatsPopover extends React.Component {
    props: Props;
    state: State;
    loadData: () => void;

    constructor(props: Props) {
        super(props);

        this.state = {
            ratings: undefined,
            stats: undefined,
        };

        this.loadData = this.loadData.bind(this);
    }

    async loadData() {
        const p = await toWorker('ratingsStatsPopoverInfo', this.props.pid);

        // This means retired players will show placeholder, which is probably not ideal
        if (p !== undefined) {
            const {ratings, stats} = p;
            this.setState({
                ratings,
                stats,
            });
        }
    }


    render() {
        const {ratings, stats} = this.state;

        let ratingsBlock;
        if (ratings) {
            ratingsBlock = <div className="row">
                <div className="col-xs-4">
                    <b>Ratings</b><br />
                    <span className={colorRating(ratings.hgt)}>Ad: {ratings.hgt}</span><br />
                    <span className={colorRating(ratings.stre)}>Ft: {ratings.stre}</span><br />
                    <span className={colorRating(ratings.spd)}>Con: {ratings.spd}</span><br />
                    <span className={colorRating(ratings.jmp)}>TP: {ratings.jmp}</span><br />
                    <span className={colorRating(ratings.endu)}>Ld: {ratings.endu}</span>
                </div>
                <div className="col-xs-4">
                    <span className={colorRating(ratings.ovr, 'ovr')}>Ovr: {ratings.ovr}</span><br />
                    <span className={colorRating(ratings.ins)}>Aw: {ratings.ins}</span><br />
                    <span className={colorRating(ratings.dnk)}>La: {ratings.dnk}</span><br />
                    <span className={colorRating(ratings.ft)}>TF: {ratings.ft}</span><br />
                    <span className={colorRating(ratings.fg)}>RT: {ratings.fg}</span><br />
                    <span className={colorRating(ratings.tp)}>Ps: {ratings.tp}</span>
                </div>
                <div className="col-xs-4">
                    <span className={colorRating(ratings.pot, 'ovr')}>Pot: {Math.round(ratings.pot)}</span><br />
                    <span className={colorRating(ratings.blk)}>SkS: {ratings.blk}</span><br />
                    <span className={colorRating(ratings.stl)}>LH: {ratings.stl}</span><br />
                    <span className={colorRating(ratings.drb)}>SuS: {ratings.drb}</span><br />
                    <span className={colorRating(ratings.pss)}>St: {ratings.pss}</span><br />
                    <span className={colorRating(ratings.reb)}>InjR: {ratings.reb}</span>
                </div>
            </div>;
        } else {
            ratingsBlock = <div className="row">
                <div className="col-xs-12">
                    <b>Ratings</b><br />
                    <br />
                    <br />
                    <br />
                    <br />
                    <br />
                </div>
            </div>;
        }

        let statsBlock;
        if (stats) {
            statsBlock = <div className="row" style={{marginTop: '1em'}}>
                <div className="col-xs-4">
                    <b>Stats</b><br />
                    K: {stats.pts.toFixed(1)}<br />
                    Reb: {stats.trb.toFixed(1)}<br />
                    Ast: {stats.ast.toFixed(1)}
                </div>
                <div className="col-xs-4">
                    <br />
                    Blk: {stats.blk.toFixed(1)}<br />
                    Stl: {stats.stl.toFixed(1)}<br />
                    TO: {stats.tov.toFixed(1)}
                </div>
                <div className="col-xs-4">
                    <br />
                    Min: {stats.min.toFixed(1)}<br />
                    PER: {stats.per.toFixed(1)}<br />
                    EWA: {stats.ewa.toFixed(1)}
                </div>
            </div>;
        } else {
            statsBlock = <div className="row" style={{marginTop: '1em'}}>
                <div className="col-xs-12">
                    <b>Stats</b><br />
                    <br />
                    <br />
                    <br />
                </div>
            </div>;
        }

        const popoverPlayerRatings = <Popover id={`ratings-pop-${this.props.pid}`}>
            <div style={{minWidth: '250px', whiteSpace: 'nowrap'}}>
                {ratingsBlock}
            </div>
        </Popover>;

        return <OverlayTrigger
            onEnter={this.loadData}
            overlay={popoverPlayerRatings}
            placement="bottom"
            rootClose
            trigger="click"
        >
            <span className="glyphicon glyphicon-stats watch" data-no-row-highlight="true" title="View ratings and stats" />
        </OverlayTrigger>;
    }
}

RatingsStatsPopover.propTypes = {
    pid: React.PropTypes.number.isRequired,
};

export default RatingsStatsPopover;