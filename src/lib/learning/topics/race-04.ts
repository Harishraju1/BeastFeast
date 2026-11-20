import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_04: Topic[] = [
  defineTopic("race", 4, {
    slug: "2wd-vs-4wd",
    title: "2WD vs 4WD",
    minutes: 9,
    summary: "Comparing two-wheel and four-wheel drive for race cars: traction, turning, weight, current draw and driver wiring.",
    introduction:
      "One of the first design decisions for a race car is how many wheels are driven. A 2WD car usually has two driven wheels and a caster or free wheels; a 4WD car drives all four wheels, usually with two motors per side. Each layout changes how much grip is available for acceleration, how easily the car turns, how much it weighs and how much current the motor driver must supply.\n\nThe club standard for every robot is 4WD: four DC gear motors, no caster, and skid steering with the left pair and the right pair driven together. This topic explains why, and what you trade for it, by comparing it with 2WD.",
    beginner:
      "Think about pushing a heavy shopping trolley. If only you push, you can slip on a smooth floor. If a friend pushes too, there are two pairs of feet gripping the floor, so you can push harder before anyone slips. Driving all four wheels of a robot is like adding that friend: more wheels are pushing, so the robot can accelerate harder before the tyres spin.\n\nBut there is a catch. Steering a 4WD robot by running the left and right sides at different speeds forces some wheels to slide sideways in a turn. That 'scrubbing' wastes energy and makes tight turns harder. A 2WD robot with a ball caster turns very easily, because the caster rolls in any direction.\n\n4WD also means four motors, more weight and roughly double the current from the motor driver. So 4WD is great for fast starts and rough or slippery tracks, while 2WD is lighter, simpler and turns more freely. The club builds every robot as 4WD because grip and pushing power matter in every event. You then tune it for corners by keeping the car short and wide.",
    technical: [
      {
        heading: "Traction limit",
        body:
          "The largest force a tyre can transmit before slipping is F_max = μ · N, where μ is the friction coefficient and N the normal force on the driven wheels. If a fraction f of the robot's weight rests on driven wheels, the maximum acceleration is:\n\na_max = μ · f · g\n\nExample with μ = 0.8: a 2WD car with 60% of its weight on the driven wheels can reach a_max = 0.8 × 0.6 × 9.81 ≈ 4.7 m/s². A 4WD car (f = 1) can reach 0.8 × 9.81 ≈ 7.8 m/s², provided its motors have enough torque. This is why 4WD launches harder and why 2WD designers move the battery over the driven axle.",
      },
      {
        heading: "Turning and scrubbing",
        body:
          "A 2WD car with a caster pivots about the midpoint of its driven axle and turns with little resistance.\n\nA 4WD skid-steer car turns by running one side faster than the other. The wheels are fixed straight, so during rotation the front and rear wheels must slide sideways. The resisting torque grows with the wheelbase relative to the track width: a long, narrow 4WD car turns reluctantly, while a short, wide one (wheelbase similar to or shorter than track width) turns more easily. Scrubbing also raises motor current during turns.",
      },
      {
        heading: "Electrical impact and driver choice",
        body:
          "Most 4WD cars wire the two motors on each side in parallel to one driver channel. The channel current is then the sum of both motors. If each motor can draw 1 A near stall, one side can draw 2 A, which is at the limit of an L298N channel (about 2 A continuous per channel) and well above a TB6612FNG channel (about 1.2 A average) or a DRV8833 channel (about 1.5 A RMS). Options are a driver rated for the total current, or two drivers so that every motor has its own channel.\n\nParallel motors must have the same polarity: if one is reversed the two motors fight each other, the side barely moves and the driver heats up.",
      },
    ],
    workingPrinciple:
      "Driving force reaches the ground only through tyre friction, which is proportional to the load on the driven wheels. 4WD puts all of the robot's weight on driven wheels, raising the traction limit, while 2WD relies on the share of weight above its driven axle. Steering in both layouts is differential: the robot turns because one side moves faster than the other, which is easy with a caster and requires sideways scrubbing with four fixed wheels.",
    diagrams: [
      { kind: "formula", latexish: "a_max = μ · f · g", legend: { a_max: "maximum acceleration before wheelspin (m/s²)", "μ": "tyre–track friction coefficient", f: "fraction of weight on driven wheels (1 for 4WD)", g: "9.81 m/s²" } },
      { kind: "circuit", nodes: [ { id: "drv", label: "Motor driver", x: 50, y: 50 }, { id: "fl", label: "Front-left motor", x: 10, y: 15 }, { id: "rl", label: "Rear-left motor", x: 10, y: 85 }, { id: "fr", label: "Front-right motor", x: 90, y: 15 }, { id: "rr", label: "Rear-right motor", x: 90, y: 85 } ], edges: [ { from: "drv", to: "fl", label: "OUT1/OUT2" }, { from: "drv", to: "rl", label: "OUT1/OUT2 (parallel)" }, { from: "drv", to: "fr", label: "OUT3/OUT4" }, { from: "drv", to: "rr", label: "OUT3/OUT4 (parallel)" } ] },
    ],
    examples: [
      {
        title: "Setting up the club 4WD car for a twisty track",
        body: "A track with long straights and a ramp suits 4WD well: full traction lets the car launch and climb without wheelspin. A track with many 90° turns and short straights rewards turning agility, which is where skid steering costs you. Keep the wheelbase similar to or shorter than the track width, use the same tyres on all four wheels, and slow down a little before tight turns so the motors have torque to spare for scrub. For comparison, a 2WD car with the battery over its driven axle (f ≈ 0.7–0.8) would turn more easily on its caster but launch and climb with less grip.",
      },
      {
        title: "Driving a 4WD car with one L298N",
        body: "Wire both left motors in parallel on OUT1/OUT2 and both right motors on OUT3/OUT4, checking each pair spins the same way before tightening the terminals. The code is identical to a 2WD car because each side is still one channel.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;
const int ENB = 6, IN3 = 9, IN4 = 10;

void drive(int left, int right) {
  digitalWrite(IN1, left >= 0 ? HIGH : LOW);
  digitalWrite(IN2, left >= 0 ? LOW : HIGH);
  digitalWrite(IN3, right >= 0 ? HIGH : LOW);
  digitalWrite(IN4, right >= 0 ? LOW : HIGH);
  analogWrite(ENA, constrain(abs(left), 0, 255));
  analogWrite(ENB, constrain(abs(right), 0, 255));
}

void setup() {
  int pins[] = {ENA, IN1, IN2, ENB, IN3, IN4};
  for (int i = 0; i < 6; i++) pinMode(pins[i], OUTPUT);
}

void loop() {
  drive(200, 200);
  delay(1500);
  drive(200, 60);
  delay(600);
  drive(0, 0);
  delay(2000);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Wiring one of two parallel motors with reversed polarity.", why: "The two motors on that side push against each other, so the side barely moves and the driver channel overheats.", fix: "Test each motor individually, mark + and − on each, then connect pairs with matching polarity." },
      { mistake: "Using a small driver channel for two motors in parallel.", why: "Channel current is the sum of both motors; overloading causes thermal shutdown or damage.", fix: "Add the motors' currents and choose a driver whose per-channel rating covers it, or use one channel per motor." },
      { mistake: "Building a long, narrow 4WD car for a twisty track.", why: "Skid-steer turning resistance increases with wheelbase relative to track width, so the car understeers and draws high current in turns.", fix: "Keep the wheelbase similar to or shorter than the track width, as on the club's standard 4WD chassis." },
    ],
    keyTakeaways: [
      "Traction limit a_max = μ·f·g: 4WD uses all the weight for traction.",
      "2WD with a caster turns easily; 4WD skid steering scrubs sideways in turns.",
      "Parallel motors on one channel add their currents.",
      "Matching motor polarity is essential when paralleling motors.",
      "The club standard is 4WD; keep the car short and wide so it still turns well on twisty tracks.",
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "BO Gear Motor", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "2WD vs 4WD robot car comparison skid steering",
    quiz: [
      {
        type: "predict-movement",
        prompt: "A 4WD skid-steer car runs both LEFT motors forward at full PWM while both RIGHT motors are stopped (PWM 0, braked). Seen from above, what does it do?",
        options: ["Drives straight forward at half speed", "Turns right (clockwise), pivoting near the right side", "Turns left (anticlockwise), pivoting near the left side", "Spins on the spot about its centre"],
        answerIndex: 1,
        explanation: "Only the left side pushes forward, so the car rotates clockwise around the stopped right side. It would only spin about its centre if the right side drove backward at the same speed, and it cannot go straight with one side stopped.",
        difficulty: 1,
      },
      {
        type: "identify-driver",
        prompt: "A 4WD car has two motors per side in parallel on one channel per side. Each motor can draw up to 1 A near stall (given). Using a single two-channel board, which driver's per-channel continuous rating covers about 2 A per side?",
        options: ["DRV8833 (about 1.5 A RMS per channel)", "TB6612FNG (about 1.2 A average per channel)", "A single NPN transistor per side", "L298N (about 2 A per channel)"],
        answerIndex: 3,
        explanation: "Two 1 A motors in parallel draw up to 2 A on one channel, which matches the L298N's roughly 2 A per-channel rating (with about 2 V of drop and noticeable heat). The DRV8833 and TB6612FNG are excellent drivers but their per-channel ratings are below 2 A, and a single transistor cannot reverse the motor.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A 2WD car has 60% of its weight on the driven wheels and tyres with μ = 0.8. What is the maximum acceleration before wheelspin? (g = 9.81 m/s²)",
        options: ["7.8 m/s²", "4.7 m/s²", "2.9 m/s²", "0.48 m/s²"],
        answerIndex: 1,
        explanation: "a_max = μ · f · g = 0.8 × 0.6 × 9.81 ≈ 4.7 m/s². 7.8 m/s² is the 4WD value (f = 1), which forgets that the caster carries 40% of the weight without driving.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "On this 4WD car the right side shudders and barely moves, and the right channel of the driver gets hot. Which connection is wrong?",
        diagram: { kind: "circuit", nodes: [ { id: "o3", label: "OUT3", x: 50, y: 30 }, { id: "o4", label: "OUT4", x: 50, y: 70 }, { id: "fr", label: "Front-right motor", x: 90, y: 20 }, { id: "rr", label: "Rear-right motor", x: 90, y: 80 } ], edges: [ { from: "o3", to: "fr", label: "to FR +" }, { from: "o4", to: "fr", label: "to FR −" }, { from: "o3", to: "rr", label: "to RR −" }, { from: "o4", to: "rr", label: "to RR +" } ] },
        options: ["OUT3 → front-right +", "OUT4 → front-right −", "OUT3 → rear-right − (rear motor reversed)", "There is no fault; the driver is simply too small"],
        answerIndex: 2,
        explanation: "OUT3 goes to the + terminal of the front motor but to the − terminal of the rear motor, so the two right motors are driven in opposite directions and fight each other, causing shuddering and high current. The front-right connections are consistent; blaming the driver size misses the polarity error.",
        difficulty: 3,
      },
    ],
  }),

  defineTopic("race", 5, {
    slug: "dc-motors",
    title: "DC Motors",
    minutes: 10,
    summary: "How brushed DC motors turn current into torque, why they have a stall current and a no-load speed, and how to use them safely.",
    introduction:
      "Almost every club race car uses brushed DC gear motors: yellow TT/BO motors, tiny metal-gear N20 motors or larger can-type motors with gearboxes. Understanding the simple model behind them explains why they speed up with voltage, why they draw huge current when blocked, and why they must never be driven straight from an Arduino pin.",
    beginner:
      "A DC motor is like a merry-go-round pushed by magnets. Inside there is a coil of wire on a shaft, surrounded by permanent magnets. When current flows through the coil it becomes a magnet too, and it is pushed and pulled by the permanent magnets, so the shaft turns. Just before the coil would settle and stop, a rotating switch called the commutator, touched by small brushes, reverses the current in the coil, so the push keeps going round and round.\n\nTwo simple rules help you predict a DC motor. First, more voltage makes it spin faster. Second, more load makes it slow down and draw more current. If you hold the shaft so it cannot turn at all, the motor 'stalls' and draws the most current of all, which heats it up quickly and can damage your driver or battery.\n\nReverse the two wires and the motor spins the other way. That is why robots use an H-bridge motor driver: it can flip the polarity to go forward or backward. The tiny 40 mA an Arduino pin can give is nowhere near enough for a motor, so the Arduino only gives instructions and the driver supplies the power.",
    technical: [
      {
        heading: "Electrical model",
        body:
          "A brushed DC motor can be modelled as a resistance R in series with a back-EMF that is proportional to speed:\n\nV = I · R + kₑ · ω\n\nand the torque is proportional to current: τ = kₜ · I (in SI units kₑ and kₜ are numerically equal).\n\n- At stall (ω = 0), the current is I_stall = V / R. Example: a motor with R = 2.5 Ω on 7.4 V draws I_stall ≈ 3 A.\n- At no load (τ ≈ 0), the current is small and the speed is ω₀ ≈ V / kₑ, so no-load speed is roughly proportional to voltage.",
      },
      {
        heading: "The speed–torque line",
        body:
          "Combining the equations gives a straight line: τ = τ_stall · (1 − ω/ω₀). Mechanical power P = τ · ω is zero at both ends (zero speed at stall, zero torque at no load) and peaks at half stall torque and half no-load speed:\n\nP_max = τ_stall · ω₀ / 4\n\nEfficiency peaks at a lighter load than maximum power, so a race motor that spends most of its time near half speed is working hard and getting hot. Gearing (later topics) moves the operating point along this line.",
      },
      {
        heading: "Practical motor families",
        body:
          "- TT / BO motors: plastic gearbox, cheap and light, commonly sold in several RPM versions; fine for learning and light cars.\n- N20 micro gear motors: small metal gearbox, many ratios, 3 mm D-shaft; popular for compact fast cars.\n- Larger can motors with metal gearboxes: more power and higher current, need a stronger driver and battery.\n\nBrushes create electrical noise. A small ceramic capacitor (commonly 0.1 µF) soldered across the motor terminals helps reduce interference with the Arduino and sensors.",
      },
      {
        heading: "Why never from an Arduino pin",
        body:
          "An Uno I/O pin has an absolute maximum of 40 mA (20 mA recommended). Even a small motor's running current is hundreds of milliamps and its stall current can be amperes, and the motor's inductance creates voltage spikes when switched off. Always drive motors through a driver (H-bridge) with its own supply, and connect the driver's ground to the Arduino ground.",
      },
    ],
    workingPrinciple:
      "Current in the rotor windings produces a magnetic field that interacts with the stator's permanent magnets, creating torque τ = kₜ·I. The commutator and brushes reverse the winding current every half turn so the torque keeps the same direction. As the rotor speeds up, it generates a back-EMF kₑ·ω that opposes the supply, which limits current and sets the no-load speed; loading the shaft lowers the speed, reduces back-EMF and lets more current flow to produce more torque.",
    diagrams: [
      { kind: "formula", latexish: "V = I · R + kₑ · ω ;  τ = kₜ · I", legend: { V: "supply voltage at motor (V)", I: "motor current (A)", R: "winding resistance (Ω)", "kₑ": "back-EMF constant (V·s/rad)", "ω": "shaft speed (rad/s)", "τ": "torque (N·m)", "kₜ": "torque constant (N·m/A)" } },
      { kind: "signal", title: "Speed–torque and power curves (normalised)", xLabel: "Torque (fraction of stall)", yLabel: "Speed / power (fraction of max)", series: [ { label: "Speed", points: [[0, 1], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [1, 0]] }, { label: "Power", points: [[0, 0], [0.25, 0.75], [0.5, 1], [0.75, 0.75], [1, 0]] } ] },
    ],
    examples: [
      {
        title: "Estimating stall current with a multimeter",
        body: "With the motor disconnected, measure the resistance across its terminals with a multimeter (rotate the shaft slightly and take the lowest steady reading, since brush position changes it). If you read 3 Ω and your battery is 7.4 V, stall current ≈ 7.4 / 3 ≈ 2.5 A. Your driver channel and battery must handle that peak, at least briefly, during hard starts and collisions.",
      },
      {
        title: "Bench test: direction and speed",
        body: "Connect a motor to one L298N channel with ENA on pin 5. The sketch ramps the speed up forward, stops, then runs reverse, so you can see speed follow PWM and direction follow the IN pins.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  for (int s = 0; s <= 255; s += 5) {
    analogWrite(ENA, s);
    delay(40);
  }
  analogWrite(ENA, 0);
  delay(1000);
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  analogWrite(ENA, 180);
  delay(1500);
  analogWrite(ENA, 0);
  delay(1000);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Connecting a motor directly to an Arduino output pin.", why: "Motor current far exceeds the pin's 40 mA absolute maximum and inductive spikes can destroy the pin.", fix: "Always use a motor driver powered from the battery, sharing ground with the Arduino." },
      { mistake: "Ignoring stall current when choosing a driver and battery.", why: "At start-up and when blocked, the motor draws close to V/R, which can trip drivers or sag the battery.", fix: "Estimate I_stall = V/R and choose a driver and battery that tolerate it." },
      { mistake: "Leaving a motor stalled against a wall at full PWM.", why: "All the input power turns into heat in the windings, softening plastic gears and damaging magnets/brushes.", fix: "Detect stalls (no speed change, high current) and cut the PWM; avoid long pushing tests at full power." },
    ],
    keyTakeaways: [
      "V = I·R + kₑ·ω and τ = kₜ·I describe a brushed DC motor.",
      "Stall current I_stall = V/R is the worst-case current.",
      "No-load speed is roughly proportional to voltage.",
      "Maximum mechanical power occurs at half stall torque and half no-load speed.",
      "Reversing polarity reverses direction; always use an H-bridge driver.",
    ],
    relatedComponents: ["BO Gear Motor", "TT Yellow Gear Motor", "N20 Micro Metal Gear Motor", "L298N", "Ceramic Capacitor"],
    youtubeSearch: "how a brushed DC motor works commutator back EMF",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "A DC gear motor is connected directly to a 6 V battery and spins clockwise. You swap the two motor wires at the battery. What happens?",
        options: ["It spins anticlockwise at about the same speed", "It spins clockwise at half speed", "It does not spin because DC motors are polarised", "It spins clockwise faster"],
        answerIndex: 0,
        explanation: "Reversing the current reverses the force on the rotor windings, so the motor turns the opposite way at about the same speed (same voltage). Brushed DC motors are not damaged or blocked by reversed polarity, which is exactly what H-bridges exploit.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "Inside a brushed DC motor, which part reverses the current in the rotor windings every half turn so the shaft keeps rotating?",
        options: ["Encoder disc", "Gearbox", "Commutator (with brushes)", "H-bridge"],
        answerIndex: 2,
        explanation: "The commutator is a segmented ring on the rotor; the brushes sliding on it switch the winding current at the right moments. An H-bridge reverses the whole motor's polarity to change direction, but it is outside the motor and does not do the per-turn switching.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A motor has a winding resistance of 2.5 Ω and is powered from 7.4 V. Approximately what current does it draw at stall?",
        options: ["0.34 A", "1.5 A", "3.0 A", "18.5 A"],
        answerIndex: 2,
        explanation: "At stall there is no back-EMF, so I = V / R = 7.4 / 2.5 ≈ 2.96 A ≈ 3.0 A. 18.5 A comes from multiplying V × R, which is not Ohm's law.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "Which connection in this motor test setup is wrong?",
        diagram: { kind: "circuit", nodes: [ { id: "bat", label: "7.4 V battery", x: 10, y: 20 }, { id: "drv", label: "L298N", x: 50, y: 20 }, { id: "uno", label: "Arduino Uno", x: 50, y: 80 }, { id: "m", label: "Motor", x: 90, y: 50 } ], edges: [ { from: "bat", to: "drv", label: "+ to 12V terminal" }, { from: "bat", to: "drv", label: "− to GND" }, { from: "drv", to: "uno", label: "GND to GND" }, { from: "uno", to: "m", label: "D9 to motor +" } ] },
        options: ["Battery + to the L298N 12V terminal", "Battery − to L298N GND", "L298N GND to Arduino GND", "Arduino D9 directly to the motor"],
        answerIndex: 3,
        explanation: "The motor must be connected to the driver outputs (OUT1/OUT2), never to an Arduino pin, which is limited to 40 mA absolute maximum. The battery-to-driver and shared-ground connections are correct and necessary.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 6, {
    slug: "motor-rpm",
    title: "Motor RPM",
    minutes: 8,
    summary: "What a motor's RPM rating really means, why loaded RPM is lower, and how RPM turns into track speed.",
    introduction:
      "Motor listings advertise an RPM figure such as '300 RPM at 6 V'. That number is normally the no-load speed of the gearbox output at the stated voltage. On a robot the motor carries load, the driver drops some voltage and the battery sags, so the real wheel RPM is lower. Knowing how RPM scales lets you predict speed, match left and right motors and choose sensible PWM values.",
    beginner:
      "RPM means revolutions per minute: how many full turns the shaft makes in one minute. Picture a cyclist pedalling. With no hill and no wind they pedal very fast. Put them on a hill or give them a heavy backpack and their pedalling slows, even though they are trying just as hard. A motor's RPM rating is like the cyclist's speed on flat ground with nothing to carry.\n\nOn your robot, the motor must push the robot's weight, overcome friction in the gears and tyres, and run from a battery whose voltage drops as it works. The motor driver also 'eats' some voltage, especially the L298N. All of this means the real RPM is lower than the box says.\n\nTwo motors with the same label are also never exactly identical. One might turn a bit faster than its twin, so your robot slowly curves even when you send both the same PWM. Racers measure their motors, choose wheel sizes to get the speed they want, and use calibration in code so the robot drives straight.",
    technical: [
      {
        heading: "From RPM to speed",
        body:
          "Wheel RPM N converts to linear speed with v = π · D · N / 60 and to angular speed with ω = 2π · N / 60 (rad/s).\n\nWorked example: 300 RPM on a 65 mm wheel gives v = π × 0.065 × 300 / 60 ≈ 1.02 m/s, and ω = 2π × 300 / 60 ≈ 31.4 rad/s.",
      },
      {
        heading: "How voltage and load change RPM",
        body:
          "For a brushed DC motor the no-load speed is roughly proportional to the voltage at the motor terminals. A motor rated 300 RPM at 6 V would run at about 300 × 4/6 = 200 RPM no-load if it actually received 4 V, for example from a 6 V supply through an L298N that drops about 2 V.\n\nLoad then pulls the speed down along the speed–torque line: ω = ω₀ · (1 − τ/τ_stall). Running at 30% of stall torque leaves about 70% of the no-load speed. Battery sag under current lowers the terminal voltage further, so lap times get slower as the battery discharges.",
      },
      {
        heading: "Measuring RPM",
        body:
          "- Encoder or slotted disc with an optical sensor: count pulses in a fixed time, RPM = pulses × 60 / (pulses per revolution × time in s).\n- Hall-effect sensor with a magnet on the wheel.\n- Phone slow-motion video of a marked wheel, counting turns.\n\nOn an Arduino Uno, int is 16-bit (−32768 to 32767), so intermediate results like pulses × 60 overflow quickly: use long for RPM calculations.",
      },
    ],
    workingPrinciple:
      "A DC motor accelerates until its back-EMF plus resistive drop equals the applied voltage. With little load this happens near ω₀ ≈ V/kₑ, the rated no-load speed. Adding load torque requires more current, which increases the I·R drop and leaves less voltage for back-EMF, so the motor settles at a lower speed. The gearbox divides this speed by its ratio and the wheel converts it into linear speed.",
    diagrams: [
      { kind: "formula", latexish: "v = π · D · N / 60 ;  ω = 2π · N / 60", legend: { v: "linear speed (m/s)", D: "wheel diameter (m)", N: "wheel RPM", "ω": "angular speed (rad/s)" } },
      { kind: "signal", title: "Wheel RPM vs supply voltage (example motor rated 300 RPM at 6 V, no load)", xLabel: "Voltage at motor (V)", yLabel: "RPM", series: [ { label: "No-load (ideal, proportional)", points: [[0, 0], [2, 100], [4, 200], [6, 300]] } ] },
    ],
    examples: [
      {
        title: "Counting RPM with a slotted disc sensor",
        body: "An optical slot sensor on pin 2 produces 20 pulses per wheel revolution. The sketch counts pulses with an interrupt for one second and prints the wheel RPM, using long arithmetic to avoid 16-bit overflow.",
        code: `const int SENSOR_PIN = 2;
const long PULSES_PER_REV = 20;
volatile long pulses = 0;

void countPulse() {
  pulses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), countPulse, RISING);
}

void loop() {
  noInterrupts();
  pulses = 0;
  interrupts();
  delay(1000);
  noInterrupts();
  long counted = pulses;
  interrupts();
  long rpm = counted * 60L / PULSES_PER_REV;
  Serial.print("RPM: ");
  Serial.println(rpm);
}`,
      },
      {
        title: "Matching two motors",
        body: "At PWM 200 your left wheel measures 240 RPM and your right wheel 225 RPM. To drive straight, scale the faster side down: left PWM = 200 × 225/240 ≈ 188. Re-measure, because motor speed is not perfectly linear with PWM, and store the correction factors as constants in your code.",
      },
    ],
    commonMistakes: [
      { mistake: "Assuming the robot will reach the box RPM.", why: "Rated RPM is usually no-load at a stated voltage; load, driver drop and battery sag all reduce it.", fix: "Measure real loaded RPM on the robot and design with that value." },
      { mistake: "Calculating RPM with int on an Uno.", why: "int is 16-bit, so pulses × 60 overflows above 32767 and gives negative or wrong results.", fix: "Use long variables and long constants such as 60L." },
      { mistake: "Expecting identical motors to run at identical speed.", why: "Manufacturing tolerances in gearboxes and windings make 'twin' motors differ.", fix: "Measure both and apply a per-side PWM correction or closed-loop speed control." },
    ],
    keyTakeaways: [
      "Rated RPM is normally no-load speed at a stated voltage.",
      "No-load RPM scales roughly with motor terminal voltage.",
      "Load, driver voltage drop and battery sag reduce real RPM.",
      "v = π·D·N/60 converts RPM to track speed.",
      "Use long arithmetic for RPM on 16-bit-int boards like the Uno.",
    ],
    relatedComponents: ["BO Gear Motor", "N20 Micro Metal Gear Motor", "L298N", "Arduino Uno R3"],
    youtubeSearch: "measure DC motor RPM Arduino encoder interrupt",
    quiz: [
      {
        type: "calculate",
        prompt: "A wheel of diameter 65 mm turns at 300 RPM. What is the robot's linear speed?",
        options: ["0.34 m/s", "1.02 m/s", "2.04 m/s", "61.3 m/s"],
        answerIndex: 1,
        explanation: "v = π × 0.065 × 300 / 60 ≈ 1.02 m/s. 2.04 m/s comes from using 2π (confusing radius and diameter), and 61.3 is the speed in metres per MINUTE, not per second.",
        difficulty: 1,
      },
      {
        type: "code-output",
        prompt: "This code runs on an Arduino Uno. What is printed?",
        code: `void setup() {
  Serial.begin(9600);
  int pulses = 700;
  int ppr = 20;
  int rpm = pulses * 60 / ppr;
  Serial.println(rpm);
}

void loop() {
}`,
        options: ["2100", "-1176", "-1177", "42000"],
        answerIndex: 1,
        explanation: "On the Uno int is 16-bit. 700 × 60 = 42000 does not fit (max 32767) and wraps to 42000 − 65536 = −23536 (signed overflow is formally undefined in C++, but AVR-GCC wraps like this in practice). Then −23536 / 20 = −1176.8, and integer division truncates toward zero, giving −1176, not −1177. The intended 2100 needs long arithmetic, e.g. pulses * 60L / ppr.",
        difficulty: 3,
      },
      {
        type: "predict-movement",
        prompt: "Both motors receive PWM 200. At that PWM the left wheel actually turns at 240 RPM and the right wheel at 220 RPM (same wheel size). What does the car do?",
        options: ["Drives straight", "Curves gradually to the left", "Spins on the spot", "Curves gradually to the right"],
        answerIndex: 3,
        explanation: "The left side travels further per second than the right side, so the car arcs towards the slower right side. It would curve left only if the left wheel were slower; it does not spin because both wheels still move forward.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "A motor is advertised as '300 RPM at 6 V'. On your robot, powered from 6 V through an L298N, the wheel measures about 170 RPM. Which explanation fits best?",
        options: ["The motor is faulty and should be returned", "The rating is a loaded speed, so it should be higher than 300 on the robot", "Driver voltage drop and the robot's load both reduce RPM below the no-load rating", "PWM always halves motor speed"],
        answerIndex: 2,
        explanation: "The L298N drops roughly 2 V, so the motor sees about 4 V (≈200 RPM no-load), and the robot's load pulls it lower still. Rated RPM is a no-load figure, not a loaded one, and PWM only reduces speed if the duty cycle is below 100%.",
        difficulty: 2,
      },
    ],
  }),
];
