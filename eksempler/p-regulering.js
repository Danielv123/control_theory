
function drawChart(data){
	Highcharts.chart("container", {
		title: {
			text: "Water level simulator"
		},
		subtitle: {
			text: "Cross your fingers it won't overflow"
		},
		yAxis: {
			title: {
				text: "Percentage"
			}
		},
		legend: {
			layout: "vertical",
			align: "right",
			verticalAlign: "middle"
		},
		plotOptions: {
			series: {
				label: {
					connectorAllowed: false
				},
				pointStart: 0
			}
		},
		series: data,
		responsive: {
			rules: [{
				condition: {
					maxWidth: 500
				},
				chartOptions: {
					legend: {
						layout: "horizontal",
						align: "center",
						verticalAlign: "bottom"
					}
				}
			}]
		}

	});
}
class Simulator{
	constructor(){
		this.tank = new Tank();
		this.pump = new Pump({
			fromTank: this.tank,
		});
		this.pumpSpeed = 0;
		this.setPoint = 50;
	}
	tick(){
		let tr = this.tank.update();
		let pr = this.pump.update({
			setSpeed: this.pumpSpeed,
		});
		if(tr.level < this.setPoint){
			this.pumpSpeed += 1;
		} else {
			this.pumpSpeed -= 1;
		}
		return {
			tr,
			pr,
		};
	}
}
class Tank {
	constructor(){
		this.maxLevel = 1000;
		this.level = 50;
		
		this.maxDrain = 5;
		this.minDrain = 0;
		this.lastDrain = 1;
	}
	update(){
		let drain = this.drain;
		this.level -= drain;
		this.level = Math.max(Math.min(this.maxLevel, this.level), 0);
		return {
			level: this.level,
			drained: drain,
		};
	}
	get drain(){
		let range = this.minDrain - this.maxDrain;
		range = range / 25;
		var drain;
		if(Math.random > 0.5){
			drain = this.lastDrain + (Math.random() * range);
		} else {
			drain = this.lastDrain - (Math.random() * range);
		}
		drain = Math.min(this.maxDrain, drain);
		drain = Math.max(this.minDrain, drain);
		this.lastDrain = drain;
		return drain;
	}
}
class Pump {
	constructor({fromTank}){
		this.fromTank = fromTank;
		this.speed = 0;
		this.setSpeed = 75;
		this.maxSpeed = 100;
		this.acceleration = 2;
		let capacity = 7;
		this.waterPerSpeed = capacity / this.maxSpeed;
	}
	update({setSpeed} = {}){
		if(setSpeed) this.setSpeed = setSpeed;
		let speedDiff = this.speed - this.setSpeed;
		if(speedDiff > 0){
			this.speed -= Math.min(speedDiff, this.acceleration);
		} else {
			this.speed += Math.min(Math.abs(speedDiff), this.acceleration);
		}
		this.fromTank.level += this.speed * this.waterPerSpeed;
		return {
			pumped: this.speed * this.waterPerSpeed,
			speed: this.speed,
		};
	}
}

function runSim(){
	chartData = [{
		name: "Tank Drainage",
		data: [],
	}, {
		name: "Tank level",
		data: [],
	}, {
		name: "Pump speed",
		data: [],
	}];
	sim = new Simulator();
	for(let i = 0; i < 500; i++){
		sim.tick();
		let data = sim.tick();
		chartData[0].data.push(data.tr.drained);
		chartData[1].data.push(data.tr.level);
		chartData[2].data.push(data.pr.speed);
	}
	drawChart(chartData);
}