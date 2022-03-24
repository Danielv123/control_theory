const simSettings = {
	variableSetpoint: true,
	variableDrain: false,
	setpoint: 50,
	simulationLength: 500,
	ATgenerations: 25,
	ATstabilityFactor: 3,
	usePRNG: false,
	ATtrainingRoot: 1.8,
	simulationDelay: 0,
	acceleration: 4,
}
// Seeded PRNG
prng=1
rnd=1
function LCG(s, usePRNG) {
	if(usePRNG){
		return function() {
			prng += 1;
		  s = Math.imul(16807, s) | 0 % 2147483647;
		  return (s & 2147483647) / 2147483648;
		}
	} else {
		return function(){
			rnd += 1;
			return Math.random()
		}
	}
}
prngSeed = Math.floor(Math.random()*10000);

Highcharts.setOptions({
    plotOptions: {
        line: {
			animation: false,
			// enableMouseTracking: false,
			stickyTracking: true,
			shadow: false,
			dataLabels: {
				style: { textShadow: false }
			}
		},
    },
    chart: {
        reflow: false,
        animation: false
    },
    credits: {
        enabled: false
    }
});
function drawChart(data, container = "chart1", chartHeader, chartSubtitle){
	Highcharts.chart(container, {
		chart: {
			type: "line",
		},
		title: {
			text: chartHeader,
		},
		subtitle: {
			text: chartSubtitle,
		},
		yAxis: {
			title: {
				text: 'Percentage'
			}
		},
		legend: {
			layout: 'vertical',
			align: 'right',
			verticalAlign: 'middle'
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
						layout: 'horizontal',
						align: 'center',
						verticalAlign: 'bottom'
					}
				}
			}]
		}

	});
}
class Simulator{
	constructor(settings = {}){
		this.feedbackHistory = new Array(simSettings.simulationDelay);
		this.feedbackHistory.fill(0);
		
		this.tank = new Tank(settings);
		this.pump = new Pump({
			fromTank: this.tank,
		});
		
		this.pumpSpeed = 0;
		this.setPoint = 50;
		// PID tuning parameters
		this.p = settings.p
		if(settings.p === undefined) this.p = 2;
		this.i = settings.i/100;
		if(settings.i === undefined) this.i = 0.02;
		this.d = settings.d/10;
		if(settings.d === undefined) this.d = 0.5;
		this.bias = 0;
		
		// Used internally
		this.currTick = 0;
		this.error_prior = 0;
		this.integral = 0;
	}
	update(){
		this.currTick++;
		// change setpoint halfway through simulation
		// if(this.currTick == 2500) this.setPoint = 40;
		
		// Simulate our tank and pump
		let tr = this.tank.update();
		let pr = this.pump.update({
			setSpeed: this.pumpSpeed,
		});
		this.feedbackHistory.push(tr.level); // Level in water tank, pid input
		// Calculate output for next tick using PID
		let error = this.setPoint - this.feedbackHistory.shift(); // Difference between setpoint and current level (with a delay to simulate process delay)
		// let error = this.setPoint - tr.level;
		let Pterm = this.p * error; // Proportional term
		this.integral += (error * this.i); // Integral term
		let derivative = (error - this.error_prior) * this.d; // Derivative term
		this.error_prior = error;
		this.pumpSpeed = Math.max(0.001, Pterm + this.integral + derivative + this.bias); // PID output
		
		return {
			tr,
			pr,
			sp: this.setPoint,
		}
	}
}
class Tank {
	constructor({usePRNG}){
		this.maxLevel = 100;
		this.level = 0;
		
		this.maxDrain = 5;
		this.minDrain = 0;
		this.lastDrain = 5;
		console.log(usePRNG)
		this.RNG = LCG(prngSeed, usePRNG);
	}
	update({} = {}){
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
		range = range/25;
		if(simSettings.variableDrain === true){
			if(this.RNG() > 0.56){
				var drain = this.lastDrain + (this.RNG() * range);
			} else {
				var drain = this.lastDrain - (this.RNG() * range);
			}
		} else {
			var drain = this.maxDrain - 1 + this.maxDrain*(this.level/500)
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
		this.acceleration = simSettings.acceleration;
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
		this.speed = Math.max(Math.min(this.speed, this.maxSpeed), 0);
		this.fromTank.level += this.speed * this.waterPerSpeed;
		return {
			pumped: this.speed * this.waterPerSpeed,
			speed: this.speed,
		}
	}
}
var feedbackHistory = [];
function runSim(settings){
	chartData = [{
		name: "Tank Drainage",
		data: [],
	}, {
		name: "Tank level",
		data: [],
	}, {
		name: "Pump speed",
		data: [],
	}, {
		name: "Setpoint",
		data: [],
	}, {
		name: "Integral",
		data: [],
	}];
	let startTime = Date.now();
	sim = new Simulator(settings);
	sim.setPoint = simSettings.setpoint;
	let timeSteps = simSettings.simulationLength;
	for(let i = 0; i < timeSteps; i++){
		let data = sim.update();
		// only log data to chart every X ticks to improve chart performance
		// if(!(i%Math.floor(timeSteps/500))){
			chartData[0].data.push(data.tr.drained);
			chartData[1].data.push(data.tr.level);
			chartData[2].data.push(data.pr.speed);
			chartData[3].data.push(data.sp);
			chartData[4].data.push(data.integral);
		// }
		if(simSettings.variableSetpoint){
			if(i == Math.floor(timeSteps/3)){
				sim.setPoint = 25;
			} else if(i == Math.floor((timeSteps/3)*2)){
				sim.setPoint = 75;
			}
		}
	}
	// console.log(`Simulated in ${Date.now()-startTime}ms`);
	return chartData;
}
function scoreGraph(data, target){
	let scores = data.map((point, i) => Math.abs(target[i] - point) ** (1/1.7));
	return scores;
}
function autoTune(){
	let startTime = Date.now();
	let settings = [1,1,0];
	let bestScore = 100;
	// Fancy math to set a dynamic learning rate to the 1.5th square
	let learningRate = 1/((simSettings.ATgenerations ** 2) ** (1/simSettings.ATtrainingRoot));
	
	let scoreData = [{
		name: "Best score",
		data: [],
	}, {
		name: "Best score this generation",
		data: [],
	}, {
		name: "P",
		data: [],
	}, {
		name: "I",
		data: [],
	}, {
		name: "D",
		data: [],
	}];
	
	for(let gen = simSettings.ATgenerations; gen > 0; gen--){
		// benchmark old settings
		let valueToBeat = 100;
		let bestSettingsThisGeneration = [];
		let newSettings = [];
		for(let i = 0; i < settings.length; i++){
			let newSetting = JSON.parse(JSON.stringify(settings));
			let newSetting2 = JSON.parse(JSON.stringify(settings));
			newSetting[i] += learningRate*gen;
			newSetting2[i] = Math.max(newSetting2[i]-learningRate*gen, 0.001);
			newSettings.push(newSetting);
			newSettings.push(newSetting2);
		}
		newSettings.forEach(s => {
			let score = benchmarkSettings({
				p: s[0],
				i: s[1],
				d: s[2],
			});
			if(score < valueToBeat){
				valueToBeat = score;
				bestSettingsThisGeneration = s;
			}
		});
		if(valueToBeat < bestScore){
			console.log(`Score was beat by ${JSON.stringify(bestSettingsThisGeneration)} with a score off ${valueToBeat} (old score was ${bestScore})`);
			bestScore = valueToBeat;
			settings = bestSettingsThisGeneration;
		}
		scoreData[0].data.push(bestScore);
		scoreData[1].data.push(valueToBeat);
		scoreData[2].data.push(bestSettingsThisGeneration[0]);
		scoreData[3].data.push(bestSettingsThisGeneration[1]);
		scoreData[4].data.push(bestSettingsThisGeneration[2]);
	}
	drawChart(runSim({p:settings[0], i:settings[1],d:settings[2], usePRNG: true}), "chart2", "Autotuned PID controller", `P: ${settings[0]} I: ${settings[1]} D: ${settings[2]}`);
	console.log(`Completed training in ${Date.now() - startTime}ms with P: ${settings[0]} I: ${settings[1]} D: ${settings[2]} and a final score off ${bestScore}`);
	return scoreData;
}

function benchmarkSettings(settings){
	let scores = [];
	for(let i = 0; i < ((simSettings.variableDrain && !simSettings.usePRNG) ? simSettings.ATstabilityFactor : 1); i++){
		settings.usePRNG = simSettings.usePRNG;
		let simResults = runSim(settings);
		scores = scores.concat(scoreGraph(simResults[1].data, simResults[3].data)); // simResults[3] is a graph over the setpoint, to benchmark changing setpoints.
	}
	return scores.reduce((a,b) => a+b)/scores.length;
}
// drawChart([{
	// name: "Score",
	// data: scoreGraph(runSim()[1].data, 50),
// }])
// Draw a chart with autotuned parameters
drawChart(autoTune(), "chart3");
// draw a chart with manually tuned parameters
drawChart(runSim({usePRNG: true}), "chart1");

// Handle user actions through GUI
document.querySelector("#P").value = 2,
document.querySelector("#I").value = 2,
document.querySelector("#D").value = 5,
document.querySelector("#renderGraph").onclick = e => {
	let simResults = runSim({
		usePRNG: true,
		p: document.querySelector("#P").value,
		i: document.querySelector("#I").value,
		d: document.querySelector("#D").value,
	});
	drawChart(simResults, "chart1");
}
document.querySelector("#setpoint").value = simSettings.setpoint;
document.querySelector("#setpoint").onchange = e => {
	simSettings.setpoint = document.querySelector("#setpoint").value || 0;
}
document.querySelector("#processDelay").value = 1;
document.querySelector("#processDelay").onchange = e => {
	simSettings.simulationDelay = Number(document.querySelector("#processDelay").value) || 1;
}
document.querySelector("#acceleration").value = 4;
document.querySelector("#acceleration").onchange = e => {
	simSettings.acceleration = Number(document.querySelector("#acceleration").value) || 4;
}

document.querySelector("#simulationLength").value = simSettings.simulationLength;
document.querySelector("#simulationLength").onchange = e => {
	simSettings.simulationLength = document.querySelector("#simulationLength").value || 0;
}
document.querySelector("#runAutotune").onclick = e => {
	// chart 3 is the autotune score history, the autotune draws chart2 internally
	drawChart(autoTune(), "chart3", "Autotune score", "6 permutations per generation");
}
document.querySelector("#variableSetpoint").checked = simSettings.variableSetpoint;
document.querySelector("#variableSetpoint").onclick = e => {
	simSettings.variableSetpoint = document.querySelector("#variableSetpoint").checked;
}
document.querySelector("#variableDrain").checked = simSettings.variableDrain;
document.querySelector("#variableDrain").onclick = e => {
	simSettings.variableDrain = document.querySelector("#variableDrain").checked;
}
document.querySelector("#ATgenerations").value = simSettings.ATgenerations;
document.querySelector("#ATgenerations").onchange = e => {
	simSettings.ATgenerations = document.querySelector("#ATgenerations").value || 0;
}
document.querySelector("#usePRNG").checked = simSettings.usePRNG;
document.querySelector("#usePRNG").onclick = e => {
	simSettings.usePRNG = document.querySelector("#usePRNG").checked;
}
document.querySelector("#ATstabilityFactor").value = simSettings.ATstabilityFactor;
document.querySelector("#ATstabilityFactor").onchange = e => {
	simSettings.ATstabilityFactor = Number(document.querySelector("#ATstabilityFactor").value) || 1;
}
document.querySelector("#ATtrainingRoot").value = simSettings.ATtrainingRoot;
document.querySelector("#ATtrainingRoot").onchange = e => {
	simSettings.ATtrainingRoot = document.querySelector("#ATtrainingRoot").value || 0;
}
