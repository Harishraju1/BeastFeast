import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_01: Topic[] = [
  defineTopic("line", 1, {
    slug: "intro-robotics",
    title: "Introduction to Robotics",
    minutes: 8,
    summary: "A robot is a machine that senses its surroundings, decides what to do, and acts on the world — the sense-think-act loop.",
    introduction: `Every robot you will build in this club — the line follower, the race car and the sumo bot — is built from the same three building blocks: sensors that measure the world, a controller that makes decisions, and actuators that move. This topic gives you the big picture so that every later topic has a place to fit into.

By the end you should be able to look at any small robot and name its sensors, its controller, its actuators, and its power system, and explain how information flows between them.`,
    beginner: `Think of a robot as a very simple animal. An animal has eyes and skin to notice what is happening (senses), a brain to decide what to do (thinking), and muscles to move (acting). A robot has exactly the same parts, just made of electronics.

On a line-following robot, the "eyes" are infrared sensors pointed at the floor. They tell the robot whether they are looking at a dark line or a light background. The "brain" is a small computer on a chip called a microcontroller, such as the one on an Arduino Uno. It reads the sensors many hundreds of times every second and decides whether to go straight, turn left or turn right. The "muscles" are small DC gear motors that turn the wheels. Because motors need far more electrical current than the brain can give, a motor driver board sits between them, a bit like a tendon that lets a weak nerve signal pull a strong muscle.

Finally, every animal needs food: the robot's food is its battery. If the battery is weak, everything else behaves strangely. Keep this sense-think-act picture in mind — every problem you debug will be in one of these blocks, or in the wires between them.`,
    technical: [
      {
        heading: "The sense-think-act loop",
        body: `A mobile robot runs a closed control loop. In each iteration the controller samples its sensors, computes an action, and updates its actuators. For an Arduino line follower, one loop() iteration typically takes well under a millisecond to a few milliseconds, so the loop can run hundreds or thousands of times per second.

- Sense: read inputs (digitalRead, analogRead, pulse timing).
- Think: compare readings with thresholds, compute an error, choose motor speeds.
- Act: write outputs (digitalWrite for direction, analogWrite for PWM speed).

The faster and more consistently this loop runs, the smoother the robot behaves. A blocking delay(100) inside loop() means the robot is "blind" for 100 ms; at 0.5 m/s it travels 5 cm without looking at the line.`,
      },
      {
        heading: "Subsystems of a club robot",
        body: `- Sensors: IR reflectance sensors (TCRT5000, QTR arrays) for lines, HC-SR04 ultrasonic (2–400 cm) or Sharp IR for obstacles and opponents, encoders for wheel speed.
- Controller: Arduino Uno or Nano (ATmega328P, 5 V logic, 16 MHz) or ESP32 (3.3 V logic, faster, Wi-Fi/Bluetooth).
- Actuators: brushed DC gear motors (TT, BO, N20).
- Motor driver: an H-bridge such as L298N, TB6612FNG or DRV8833, which converts weak logic signals into high-current motor power and allows direction reversal.
- Power: Li-ion 18650 cells or LiPo packs, often with a regulator or buck converter for the logic.
- Mechanics: chassis, wheels, caster, mounting of sensors at the right height.`,
      },
      {
        heading: "Signal levels and power levels",
        body: `A key engineering idea is separating signal paths from power paths. An Arduino I/O pin is rated 40 mA absolute maximum and about 20 mA recommended. A small gear motor can draw several hundred milliamps while running and much more when stalled. That gap is why a driver is mandatory: the Arduino sends direction and PWM signals of a few milliamps, and the driver switches the battery current through the motor.

All these blocks must share a common ground (0 V reference). Without it, a "HIGH" from the Arduino has no defined meaning to the driver.`,
      },
    ],
    workingPrinciple: `A robot works by repeatedly closing a feedback loop: sensors convert a physical quantity (reflected light, distance, wheel rotation) into an electrical signal; the microcontroller converts that signal into a number, applies a rule or control law, and outputs new commands; the motor driver amplifies those commands into motor power; the motors move the robot, which changes what the sensors see on the next pass. Good robots are simply robots whose loop is fast, whose sensors are reliable, and whose decision rule is well tuned.`,
    diagrams: [
      { kind: "flow", steps: ["Sense: IR sensors read the floor", "Think: Arduino compares readings and picks motor speeds", "Act: motor driver powers the gear motors", "Robot moves, sensors see a new position", "Repeat hundreds of times per second"] },
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "Battery", x: 50, y: 200 },
          { id: "sen", label: "IR sensors", x: 50, y: 60 },
          { id: "mcu", label: "Arduino Uno R3", x: 250, y: 100 },
          { id: "drv", label: "Motor driver (L298N)", x: 450, y: 100 },
          { id: "mot", label: "Gear motors", x: 620, y: 100 },
        ],
        edges: [
          { from: "sen", to: "mcu", label: "sensor signals" },
          { from: "mcu", to: "drv", label: "IN / EN logic" },
          { from: "drv", to: "mot", label: "motor power" },
          { from: "bat", to: "drv", label: "battery +", color: "red" },
          { from: "bat", to: "mcu", label: "regulated 5 V", color: "red" },
        ],
      },
    ],
    examples: [
      {
        title: "Identify the blocks of a line follower",
        body: `Take a standard 2-sensor line follower and label each part:\n\n- Sense: two TCRT5000 modules under the front bumper.\n- Think: Arduino Uno R3.\n- Act: two TT gear motors via an L298N.\n- Power: two 18650 cells in series (about 7.4 V nominal).\n\nIf the robot misbehaves, test each block on its own: print sensor values to Serial, spin each motor with a fixed command, and measure the battery voltage.`,
      },
      {
        title: "A minimal sense-think-act sketch",
        body: "This sketch reads one digital IR sensor and switches the on-board LED (pin 13) as the 'actuator'. It is the smallest complete robot loop you can build.",
        code: `const int SENSOR_PIN = 2;  // digital output of an IR sensor module
const int LED_PIN = 13;    // on-board LED stands in for a motor

void setup() {
  pinMode(SENSOR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int seen = digitalRead(SENSOR_PIN);   // sense
  bool act = (seen == HIGH);            // think
  digitalWrite(LED_PIN, act ? HIGH : LOW); // act
  Serial.println(seen);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Connecting a motor directly to an Arduino pin.", why: "A motor needs far more current than the 20 mA recommended (40 mA absolute max) per pin, and its back-EMF spikes can destroy the pin.", fix: "Always drive motors through a motor driver such as L298N, TB6612FNG or DRV8833." },
      { mistake: "Using long delay() calls in loop().", why: "While delay() runs, the robot is not reading sensors, so it drives blind and overshoots the line.", fix: "Keep loop() fast; use millis() for timing instead of blocking delays." },
      { mistake: "Forgetting the common ground between controller and driver.", why: "Logic signals are measured relative to ground; with separate grounds the driver may see random levels.", fix: "Connect Arduino GND to driver GND and battery negative." },
      { mistake: "Debugging everything at once.", why: "When sensors, code and motors are all untested, you cannot tell which block is faulty.", fix: "Test each subsystem separately (Serial print sensors, spin motors with a test sketch) before combining them." },
    ],
    keyTakeaways: [
      "Every robot follows a sense-think-act loop.",
      "Sensors measure, the microcontroller decides, the motor driver and motors act.",
      "Signal paths carry milliamps; power paths carry amps — never mix them up.",
      "All modules must share a common ground.",
      "A fast, non-blocking loop() makes a responsive robot.",
    ],
    relatedComponents: ["Arduino Uno R3", "L298N", "TCRT5000", "TT Yellow Gear Motor", "18650 Li-ion Cell"],
    youtubeSearch: "how a line follower robot works sense think act arduino",
    quiz: [
      {
        type: "mcq",
        prompt: "Which list correctly describes the three stages of the basic robot control loop?",
        options: ["Sense, think, act", "Charge, discharge, recharge", "Input, storage, display", "Compile, upload, reset"],
        answerIndex: 0,
        explanation: "A robot senses the world (sensors), thinks (the microcontroller decides) and acts (motors move). 'Compile, upload, reset' is how you program the board, not how the robot behaves while running.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "On a typical club line follower, which component is the 'brain' that reads the sensors and decides the motor commands?",
        options: ["L298N", "TCRT5000", "Arduino Uno R3", "18650 Li-ion cell"],
        answerIndex: 2,
        explanation: "The Arduino Uno R3 runs your program and makes the decisions. The L298N is tempting because it controls the motors, but it only amplifies the commands the Arduino sends — it does not decide anything.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "A two-wheeled robot has its left wheel driven forward at full speed while the right wheel is stopped. Viewed from above, what does the robot do?",
        options: ["Drives straight forward", "Turns right, pivoting around the right wheel", "Turns left, pivoting around the left wheel", "Spins in place around its centre"],
        answerIndex: 1,
        explanation: "Only the left side moves forward, so the robot swings around the stationary right wheel and turns right. Spinning in place around the centre would need the right wheel to run backward at the same speed.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt: "An Arduino pin can safely supply only about 20 mA, but a gear motor needs far more current and must also run in reverse. Which part solves both problems?",
        options: ["A 220 Ω resistor in series with the motor", "A 100 nF capacitor across the motor", "A 5 V voltage regulator", "An H-bridge motor driver such as the L298N"],
        answerIndex: 3,
        explanation: "An H-bridge driver switches battery current through the motor and can reverse its polarity. A series resistor only reduces current further and cannot reverse direction; a capacitor only suppresses noise.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 2, {
    slug: "line-following-principle",
    title: "Working Principle of Line Following",
    minutes: 9,
    summary: "A line follower shines infrared light at the floor, measures how much bounces back, and steers to keep the dark line between its sensors.",
    introduction: `A line-following robot tracks a contrasting line — usually a black line about 2–3 cm wide on a white surface, though the club rulebook defines the exact track. The idea is simple, but doing it fast and reliably is a real engineering challenge.

This topic explains the physics of how sensors 'see' the line, the basic steering logic with two and three sensors, and why the robot sometimes loses the line on sharp curves.`,
    beginner: `Imagine walking along a painted line in a dark room with a torch pointed at your feet. When the torch lights up white floor, lots of light bounces back to your eyes. When it lights up the black line, very little light comes back, because black paint absorbs most of it. You could follow the line just by noticing whether the spot looks bright or dark.

A line-following robot does exactly this, but with invisible infrared light. Each sensor has a tiny IR LED (the torch) and a light detector (the eye) placed side by side, looking down at the floor. Over white, the detector receives a lot of reflected IR; over black, it receives little.

Now place two sensors so the line runs between them. While both see white, the robot is centred and drives straight. If the robot drifts right, the left sensor slides over the black line, so the robot turns left to bring the line back to the middle. If it drifts left, the right sensor sees black and the robot turns right. That simple rule — steer toward the sensor that sees the line — is the heart of every line follower, from a beginner kit to a championship robot using PID control.`,
    technical: [
      {
        heading: "Reflectance physics",
        body: `IR reflectance sensors work around 940–950 nm (near infrared). White paper or vinyl diffusely reflects a large fraction of this light; matte black tape or paint absorbs most of it. The receiver (usually a phototransistor) passes a current roughly proportional to the light it receives.

In the most common wiring, the phototransistor sits in series with a pull-up resistor to 5 V and the output is taken at the junction. More light → more phototransistor current → larger voltage drop across the resistor → lower output voltage. So with this wiring, white reads LOW-ish (small analogRead value) and black reads HIGH-ish (large value). Always confirm the polarity of your own module with Serial prints, because some modules invert it.

Sensor height matters: reflective sensors like the TCRT5000 work best only a few millimetres from the surface. Too high and the spot spreads, contrast drops and ambient light dominates.`,
      },
      {
        heading: "Two-sensor and three-sensor logic",
        body: `With two sensors straddling the line (black line, white floor):

- L=white, R=white → line is between the sensors → forward.
- L=black, R=white → robot has drifted right → turn left.
- L=white, R=black → robot has drifted left → turn right.
- L=black, R=black → crossing, junction or end marker → follow the rule-book behaviour (often continue, or stop).

A third, centre sensor lets the robot distinguish 'perfectly centred' from 'slightly off' and gives smoother steering. Arrays of 5–8 sensors (e.g. QTR-8A) let you compute a continuous line position, which is the input for PID control.`,
      },
      {
        heading: "Why robots lose the line",
        body: `If the robot overshoots a sharp curve, both sensors can end up on white on the outside of the bend. With the simple rule above, 'both white' means 'go straight' — so the robot drives off the track. The fix is memory: store the last side that saw the line and, when both sensors see white, keep turning toward that side.

Loop rate also matters. If the robot moves at 0.5 m/s and the loop takes 20 ms, it travels 1 cm between readings. A 2 cm line can be crossed completely between two samples at high speed.`,
      },
    ],
    workingPrinciple: `Each sensor converts reflected IR intensity into a voltage. The microcontroller converts this into 'line' or 'no line' (or a numeric position), computes how far the line is from the robot's centre, and slows one wheel relative to the other so the robot turns toward the line. Because the turn changes what the sensors see on the next loop, the robot continuously corrects itself and stays on the track.`,
    diagrams: [
      { kind: "flow", steps: ["Read left and right sensors", "Both white → drive forward", "Left black → slow left wheel, turn left", "Right black → slow right wheel, turn right", "Both white after losing line → turn toward last seen side", "Repeat"] },
      {
        kind: "signal",
        title: "Single sensor sweeping across a black line (pull-up wiring)",
        xLabel: "Sensor position across track (mm)",
        yLabel: "analogRead value",
        series: [{ label: "TCRT5000 output", points: [[0, 80], [10, 85], [15, 300], [20, 850], [30, 880], [35, 870], [40, 320], [45, 90], [55, 80]] }],
      },
    ],
    examples: [
      {
        title: "Two-sensor bang-bang line follower",
        body: "Digital sensor modules on pins 2 and 3 (HIGH = black on this module). Motor speeds go to an L298N: ENA on pin 5, ENB on pin 6; IN pins are fixed for forward elsewhere in setup.",
        code: `const int LEFT_SENSOR = 2;
const int RIGHT_SENSOR = 3;
const int ENA = 5;   // left motor speed (PWM)
const int ENB = 6;   // right motor speed (PWM)
const int IN1 = 7, IN2 = 8, IN3 = 9, IN4 = 10;

void setup() {
  pinMode(LEFT_SENSOR, INPUT);
  pinMode(RIGHT_SENSOR, INPUT);
  pinMode(ENA, OUTPUT); pinMode(ENB, OUTPUT);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  // left forward
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  // right forward
}

void loop() {
  bool leftBlack = digitalRead(LEFT_SENSOR) == HIGH;
  bool rightBlack = digitalRead(RIGHT_SENSOR) == HIGH;

  if (!leftBlack && !rightBlack) {        // centred
    analogWrite(ENA, 150); analogWrite(ENB, 150);
  } else if (leftBlack && !rightBlack) {  // drifted right: turn left
    analogWrite(ENA, 60);  analogWrite(ENB, 170);
  } else if (!leftBlack && rightBlack) {  // drifted left: turn right
    analogWrite(ENA, 170); analogWrite(ENB, 60);
  } else {                                // both black: junction
    analogWrite(ENA, 0);   analogWrite(ENB, 0);
  }
}`,
      },
      {
        title: "Remembering the last side",
        body: "Add a variable that stores which side last saw the line. When both sensors see white, keep turning that way instead of driving straight. This one change fixes most 'robot leaves the track on a sharp bend' failures.",
        code: `int lastSide = 0; // -1 = left, +1 = right, 0 = unknown

void updateMemory(bool leftBlack, bool rightBlack) {
  if (leftBlack && !rightBlack) lastSide = -1;
  if (rightBlack && !leftBlack) lastSide = 1;
}

void setup() {
  Serial.begin(9600);
  updateMemory(true, false);
  Serial.println(lastSide); // prints -1
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      { mistake: "Mounting sensors too high above the floor.", why: "Reflective sensors work best a few millimetres from the surface; higher up, contrast between black and white collapses.", fix: "Mount the sensor board a few millimetres above the track and verify contrast with Serial prints." },
      { mistake: "Assuming HIGH always means black.", why: "Module polarity depends on the circuit; some modules output LOW on black.", fix: "Print raw readings over white and black before writing your logic." },
      { mistake: "Treating 'both white' as 'go straight' in every case.", why: "After overshooting a curve, both sensors see white on the outside of the bend and the robot drives off.", fix: "Remember the last side that saw the line and turn toward it when the line is lost." },
      { mistake: "Spacing the two sensors wider than the curve demands or narrower than the line.", why: "If both sensors fit on the line at once, they report 'both black' constantly; too wide and the robot zig-zags.", fix: "Space sensors slightly wider than the line width and test on the tightest curve." },
    ],
    keyTakeaways: [
      "White surfaces reflect IR strongly; black surfaces absorb it.",
      "Two sensors straddle the line; steer toward the sensor that sees black.",
      "Sensor height and spacing are as important as the code.",
      "Remember the last line position to recover on sharp curves.",
      "More sensors give a continuous line position, enabling PID control.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3", "L298N"],
    youtubeSearch: "line follower robot two IR sensor logic explained",
    quiz: [
      {
        type: "predict-movement",
        prompt: "Two sensors straddle a black line on a white floor. The LEFT sensor now sees black and the RIGHT sensor sees white. With standard logic, what should the robot do?",
        options: ["Turn left by slowing the left wheel", "Turn right by slowing the right wheel", "Drive straight", "Reverse"],
        answerIndex: 0,
        explanation: "The left sensor sees the line, so the robot has drifted to the right of it; turning left brings the line back between the sensors. Turning right would steer away from the line and lose it.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "A robot uses only this rule: left black → turn left; right black → turn right; otherwise → straight. On a sharp curve it overshoots and both sensors end up on white on the OUTSIDE of the bend. What happens next?",
        options: ["It turns back toward the line automatically", "It stops", "It drives straight and leaves the track", "It spins in place"],
        answerIndex: 2,
        explanation: "'Both white' falls into the 'otherwise → straight' case, so the robot drives straight off the bend. It does not turn back because the rule has no memory of where the line was — that is exactly why you store the last seen side.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this sketch print once on the Serial Monitor?",
        code: `int leftRaw = 720;
int rightRaw = 180;
int threshold = 500;

void setup() {
  Serial.begin(9600);
  bool leftBlack = leftRaw > threshold;
  bool rightBlack = rightRaw > threshold;
  if (leftBlack && rightBlack) Serial.println("STOP");
  else if (leftBlack) Serial.println("LEFT");
  else if (rightBlack) Serial.println("RIGHT");
  else Serial.println("FORWARD");
}

void loop() {}`,
        options: ["STOP", "LEFT", "RIGHT", "FORWARD"],
        answerIndex: 1,
        explanation: "720 > 500 so leftBlack is true; 180 > 500 is false so rightBlack is false. The first condition needs both true, so it falls to 'else if (leftBlack)' and prints LEFT. STOP would require both readings above 500.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why does a black line on a white surface work well with IR reflectance sensors?",
        options: ["Black surfaces emit infrared light", "White reflects most IR light while black absorbs most of it", "Black surfaces are electrically conductive", "White surfaces are warmer"],
        answerIndex: 1,
        explanation: "The sensor measures reflected IR: high from white, low from black, giving strong contrast. Black does not emit IR in any useful way — the sensor's own LED provides the light.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 3, {
    slug: "electronics-fundamentals",
    title: "Electronics Fundamentals",
    minutes: 10,
    summary: "Circuits need a complete loop, a source of energy, and a load; series and parallel connections, ground and power are the vocabulary of every robot schematic.",
    introduction: `Before you can wire a motor driver or read a sensor, you need the core vocabulary of electronics: charge, current, voltage, circuits, ground, series and parallel. These ideas explain why a robot resets when the motors start, why a sensor reads garbage when its ground wire is loose, and why a battery gets hot when wires touch.

This topic is the foundation for the next several lessons on voltage, Ohm's law and components.`,
    beginner: `Think of an electric circuit like a water system in a building. The battery is a pump that pushes water (electric charge) around. The pipes are wires. Anything that uses the water — a tap, a fountain, a water wheel — is a 'load', like an LED or a motor.

Water only flows if the pipe forms a complete loop back to the pump. Cut the pipe anywhere and everything stops. Electricity is the same: current only flows in a closed loop from the battery's positive terminal, through the load, and back to the negative terminal. A switch is simply a deliberate gap you can open and close.

If you connect the pump's outlet straight back to its inlet with a fat pipe and nothing in between, water rushes around uselessly as fast as the pump can manage. In electronics this is a short circuit: huge current, hot wires, damaged batteries.

Loads can be lined up one after another (series), like water flowing through one fountain and then the next, or placed side by side (parallel), like separate taps all fed from the same pipe. Robots use both: sensors are connected in parallel to the 5 V supply, while a resistor is placed in series with an LED to limit its current.`,
    technical: [
      {
        heading: "Charge, current, voltage, power",
        body: `- Current (I, amperes) is the rate of charge flow: 1 A = 1 coulomb per second. By convention current flows from + to − outside the source (electrons actually move the other way).
- Voltage (V, volts) is the energy per unit charge between two points. It is always measured between two points — usually relative to ground (0 V).
- Power (P, watts) is P = V × I. A motor drawing 0.5 A from 7.4 V consumes 3.7 W.
- Energy is power × time; battery capacity in mAh times nominal voltage gives energy (e.g. 2000 mAh × 3.7 V ≈ 7.4 Wh).`,
      },
      {
        heading: "Series and parallel",
        body: `Series: the same current flows through every element; voltages add. Two resistors in series: R_total = R1 + R2.

Parallel: every element sees the same voltage; currents add. Two resistors in parallel: R_total = (R1 × R2) / (R1 + R2). Two 10 kΩ in parallel = 5 kΩ.

Batteries: two 3.7 V cells in series give 7.4 V at the same capacity; two in parallel give 3.7 V with double the capacity. Never parallel cells at different charge levels.`,
      },
      {
        heading: "Ground and common reference",
        body: `'Ground' (GND) is the 0 V reference that all other voltages are measured from. When an Arduino sets a pin HIGH, it means about 5 V relative to the Arduino's GND. A motor driver powered from a separate battery only understands that signal if its GND is connected to the Arduino's GND. Missing common ground is one of the most frequent causes of 'motors do nothing' or 'motors twitch randomly'.

Good practice: run motor current and logic current on separate wires that meet at a single point near the battery (star grounding), so heavy motor currents do not shift the logic ground.`,
      },
      {
        heading: "Open circuits and short circuits",
        body: `An open circuit (broken wire, loose jumper, cold solder joint) means no current flows — the load is dead. A short circuit is an unintended low-resistance path, usually directly across the supply; current is limited only by the battery's internal resistance and wiring, and Li-ion/LiPo cells can deliver tens of amps into a short, melting wires and damaging the cell. Fuses and careful wiring prevent this.`,
      },
    ],
    workingPrinciple: `A source (battery) maintains a voltage difference between its terminals. When a closed conductive path connects those terminals through a load, that voltage drives a current through the path. The load converts electrical energy into light, motion or heat. The amount of current is set by the voltage and the resistance (or behaviour) of the load, and every point in the circuit is described by its voltage relative to a common ground.`,
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "Battery +", x: 60, y: 60 },
          { id: "r", label: "220 Ω resistor", x: 260, y: 60 },
          { id: "led", label: "LED", x: 440, y: 60 },
          { id: "gnd", label: "Battery − (GND)", x: 260, y: 220 },
        ],
        edges: [
          { from: "bat", to: "r" },
          { from: "r", to: "led" },
          { from: "led", to: "gnd", label: "return path" },
          { from: "gnd", to: "bat", label: "inside battery" },
        ],
      },
      {
        kind: "circuit",
        nodes: [
          { id: "ard", label: "Arduino GND", x: 80, y: 80 },
          { id: "drv", label: "Driver GND", x: 320, y: 80 },
          { id: "bat", label: "Battery −", x: 200, y: 220 },
        ],
        edges: [
          { from: "ard", to: "bat", label: "common ground" },
          { from: "drv", to: "bat", label: "common ground" },
          { from: "ard", to: "drv", label: "missing link = random behaviour", wrong: true, color: "red" },
        ],
      },
    ],
    examples: [
      {
        title: "Series vs parallel batteries",
        body: "Two 18650 cells (3.7 V nominal, 2500 mAh each):\n\n- Series (2S): 7.4 V nominal, 2500 mAh — good for an L298N, which loses about 2 V internally.\n- Parallel (1S2P): 3.7 V, 5000 mAh — longer runtime but too low a voltage for most 6 V motors through an L298N.\n\nMost club robots use 2S for enough voltage headroom.",
      },
      {
        title: "Power budget",
        body: "Two motors at 0.4 A each, Arduino about 50 mA, sensors about 40 mA, on a 7.4 V pack:\n\nI_total ≈ 0.4 + 0.4 + 0.05 + 0.04 = 0.89 A\nP ≈ 7.4 × 0.89 ≈ 6.6 W\n\nA 2000 mAh pack would last very roughly 2000 / 890 ≈ 2.2 hours at this average draw (less in practice, because motors draw more during acceleration).",
      },
    ],
    commonMistakes: [
      { mistake: "Leaving out the return (ground) wire.", why: "Current needs a complete loop; without a return path nothing flows.", fix: "Trace every circuit from + through the load back to −." },
      { mistake: "Measuring voltage 'at a single point' without a reference.", why: "Voltage is always between two points; a floating multimeter probe reads nonsense.", fix: "Put the black probe on GND and measure every node relative to it." },
      { mistake: "Connecting cells in parallel at different voltages.", why: "The fuller cell dumps a large current into the emptier one, which can overheat both.", fix: "Only parallel cells at equal charge, ideally through a proper battery holder or BMS." },
      { mistake: "Letting a loose battery lead touch the chassis or another wire.", why: "This can create a short circuit with very high current.", fix: "Insulate all connections, use heat-shrink and add a fuse near the battery." },
    ],
    keyTakeaways: [
      "Current flows only around a complete loop.",
      "Voltage is measured between two points, normally relative to GND.",
      "Series: same current, voltages add. Parallel: same voltage, currents add.",
      "P = V × I tells you how much power a component uses.",
      "Every module in a robot must share a common ground.",
    ],
    relatedComponents: ["Breadboard", "Male-to-Male Jumper Wires", "Digital Multimeter", "18650 Li-ion Cell", "Arduino Uno R3"],
    youtubeSearch: "basic electronics for beginners series parallel circuits ground",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "An LED and a 220 Ω resistor are wired from the Arduino 5 V pin, but the LED's cathode wire is left unconnected (it does not go to GND). What happens?",
        options: ["The LED glows normally", "The LED glows dimly", "The LED stays off because the circuit is open", "The Arduino resets because of a short circuit"],
        answerIndex: 2,
        explanation: "Without a return path to GND the loop is open, so no current flows and the LED stays off. It is not a short circuit — a short needs a low-resistance path back to GND, and here there is no path at all.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "An Arduino is powered by USB. An L298N is powered by a 7.4 V battery. IN1–IN4 and ENA/ENB are wired to Arduino pins, and the motors are wired to OUT1–OUT4. The motors twitch randomly or do nothing. Which connection is missing?",
        options: ["Arduino 5 V to battery +", "Arduino GND to L298N GND (battery −)", "Arduino A0 to OUT1", "Battery + to the Arduino reset pin"],
        answerIndex: 1,
        explanation: "The L298N interprets IN/EN signals relative to its own GND. Without a common ground those signals have no defined reference, giving random behaviour. Connecting Arduino 5 V to battery + would be dangerous — it ties two different supplies together.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Which statement about a simple series circuit is true?",
        options: ["Each component has the same voltage across it", "The same current flows through every component", "Current splits between the components", "Removing one component leaves the others working"],
        answerIndex: 1,
        explanation: "In series there is only one path, so the same current passes through every element. 'Same voltage across each component' describes parallel circuits, not series.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "In a schematic you see a triangle pointing at a short vertical bar. Which component is it?",
        options: ["Resistor", "Capacitor", "Battery", "Diode"],
        answerIndex: 3,
        explanation: "A triangle pointing at a bar is a diode: current flows in the direction the triangle points, and the bar marks the cathode. A capacitor is drawn as two parallel plates, without a triangle.",
        difficulty: 1,
      },
    ],
  }),
];
