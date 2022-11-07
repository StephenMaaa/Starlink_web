import React, {Component} from 'react';
import { feature } from 'topojson-client';
import axios from 'axios';
import { geoKavrayskiy7 } from 'd3-geo-projection';
import { geoGraticule, geoPath } from 'd3-geo';
import { select as d3Select } from 'd3-selection';
import {Spin} from "antd";
import {schemeCategory10} from "d3-scale-chromatic"
import * as d3Scale from "d3-scale";
import {timeFormat} from "d3-time-format"
import { WORLD_MAP_URL, SAT_API_KEY, SATELLITE_POSITION_URL } from "../constants";

const width = 960;
const height = 600;

class WorldMap extends Component {
    constructor(){
        super();
        this.state = {
            isLoading: false,
            isDrawing: false
        };
        this.map = null;
        this.color = d3Scale.scaleOrdinal(schemeCategory10);
        this.refMap = React.createRef();
        this.refTrack = React.createRef();
    }

    componentDidMount() {
        // fetch world map data
        // project data to polygon
        axios.get(WORLD_MAP_URL)
            .then(res => {
                const { data } = res;
                const land = feature(data, data.objects.countries).features;
                this.generateMap(land);
            })
            .catch(e => console.log('err in fecth world map data ', e))
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.satData !== this.props.satData) {
            const {latitude, longitude, elevation, altitude, duration} = this.props.observerData;
            const endTime = duration * 60;

            this.setState({
                isLoading: true
            });

            const urls = this.props.satData.map(sat => {
                const {satid} = sat;
                const url = `/api/${SATELLITE_POSITION_URL}/${satid}/${latitude}/${longitude}/${elevation}/${endTime}/&apiKey=${SAT_API_KEY}`;
                return axios.get(url);
            });

            Promise.all(urls)
                .then(res => {
                    const arr = res.map(sat => sat.data);
                    this.setState({
                        isLoading: false,
                        isDrawing: true
                    });

                    if (!prevState.isDrawing) {
                        this.track(arr);
                    } else {
                        const hint = document.getElementsByClassName("hint")[0];
                        hint.innerHTML = "Please wait...";
                    }
                })
                .catch(e => {
                    console.log("err in fetching satellite position -> ", e.message);
                });
        }
    }

    track = data => {
        if (!data[0].hasOwnProperty("positions")) {
            throw new Error("no position data");
            return;
        }

        const len = data[0].positions.length;
        const { duration } = this.props.observerData;
        const { contextTrack } = this.map;

        let now = new Date();

        let i = 0;

        let timer = setInterval(() => {
            let ct = new Date();

            let timePassed = i === 0 ? 0 : ct - now;
            let time = new Date(now.getTime() + 60 * timePassed);

            contextTrack.clearRect(0, 0, width, height);

            contextTrack.font = "bold 14px sans-serif";
            contextTrack.fillStyle = "#333";
            contextTrack.textAlign = "center";
            contextTrack.fillText(timeFormat(time), width / 2, 10);

            if (i >= len) {
                clearInterval(timer);
                this.setState({ isDrawing: false });
                const oHint = document.getElementsByClassName("hint")[0];
                oHint.innerHTML = "";
                return;
            }

            data.forEach(sat => {
                const { info, positions } = sat;
                this.drawSat(info, positions[i]);
            });

            i += 60;
        }, 1000);
    };

    drawSat = (sat, pos) => {
        const { satlongitude, satlatitude } = pos;

        if (!satlongitude || !satlatitude) return;

        const { satname } = sat;
        const nameWithNumber = satname.match(/\d+/g).join("");

        const { projection, contextTrack } = this.map;
        const xy = projection([satlongitude, satlatitude]);

        contextTrack.fillStyle = this.color(nameWithNumber);
        contextTrack.beginPath();
        contextTrack.arc(xy[0], xy[1], 4, 0, 2 * Math.PI);
        contextTrack.fill();

        contextTrack.font = "bold 11px sans-serif";
        contextTrack.textAlign = "center";
        contextTrack.fillText(nameWithNumber, xy[0], xy[1] + 14);
    };


    generateMap(land) {
        const projection = geoKavrayskiy7()
            .scale(170)
            .translate([width / 2, height / 2])
            .precision(.1);

        const graticule = geoGraticule();

        const canvas = d3Select(this.refMap.current)
            .attr("width", width)
            .attr("height", height);

        const canvasTrack = d3Select(this.refTrack.current)
            .attr("width", width)
            .attr("height", height);

        let context = canvas.node().getContext("2d");
        let contextTrack = canvasTrack.node().getContext("2d");

        let path = geoPath()
            .projection(projection)
            .context(context);

        land.forEach(ele => {
            context.fillStyle = '#B3DDEF';
            context.strokeStyle = '#000';
            context.globalAlpha = 0.7;
            context.beginPath();
            path(ele);
            context.fill();
            context.stroke();

            context.strokeStyle = 'rgba(220, 220, 220, 0.2)';
            context.beginPath();
            path(graticule());
            context.lineWidth = 0.1;
            context.stroke();

            context.beginPath();
            context.lineWidth = 0.5;
            path(graticule.outline());
            context.stroke();
        });

        this.map = {
            projection: projection,
            graticule: graticule,
            context: context,
            contextTrack: contextTrack
        }
    }

    render() {
        const {isLoading} = this.state;
        return (
            <div className="map-box">
                {isLoading ?
                        (<div className="loading-spinner">
                            <Spin tip="Loading..." size="large"/>
                        </div>) :
                    null
                }

                <canvas className="map" ref={this.refMap} />
                <canvas className="track" ref={this.refTrack}/>
                <div className="hint"/>
            </div>
        );
    }
}

export default WorldMap;