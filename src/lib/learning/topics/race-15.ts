import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_15: Topic[] = [
  // ---------------------------------------------------------------- 15
  defineTopic("race", 15, {
    slug: "motor-direction",
    title: "Motor Direction",
    minutes: 12,
    summary: "How an H-bridge driver reverses current through a DC motor, and how to wire and code forward, reverse, coast and brake reliably.",
    introduction:
      "A race car that can only drive forward is half a robot. Reversing lets you back out of a mistake, spin on the spot and, most importantly, brake hard before a corner. A brushed DC motor turns one way when current flows through it in one direction and the other way when the current is reversed. Your motor driver (L298N, TB6612FNG or DRV8833) is the switchboard that does this reversing for you, under the control of two logic pins per motor.\n\nIn this topic you will learn the truth tables of the common drivers, why the left and right motors usually need opposite polarity to both drive the robot forward, and how to write one clean function that accepts a signed speed from -255 to +255.",
    beginner:
      "Think of a DC motor like a water wheel in a pipe. If water flows left to right, the wheel turns clockwise. Swap the direction of the flow and the wheel turns anticlockwise. Electric current is the water, and the motor's two wires are the two ends of the pipe.\n\nYou could reverse a motor by physically swapping its two wires, but a robot needs to do it hundreds of times a second without your hands. That is the job of an H-bridge: four electronic switches arranged like the letter H with the motor in the middle bar. Close the top-left and bottom-right switches and current flows one way. Close the top-right and bottom-left and it flows the other way.\n\nYou never touch those four switches directly. The driver board gives you two input pins per motor, usually called IN1 and IN2. Set IN1 HIGH and IN2 LOW and the motor spins one way; set IN1 LOW and IN2 HIGH and it spins the other way. A third pin, the enable or PWM pin, sets how hard it pushes.\n\nOne surprise for beginners: the two motors face opposite directions on the chassis, mirror images of each other. So 'clockwise' for the left motor is forward, but 'clockwise' for the right motor is backward. You fix this either by swapping the right motor's wires or by flipping its direction in code.",
    technical: [
      {
        heading: "H-bridge switching states",
        body:
          "An H-bridge has two half-bridges, one per motor terminal. Each half-bridge connects its output either to the motor supply (VS/VM) or to ground. The motor sees the difference between the two outputs.\n\n- OUT1 high, OUT2 low: +V across the motor, current flows OUT1 to OUT2, motor turns in direction A.\n- OUT1 low, OUT2 high: -V across the motor, current reverses, motor turns in direction B.\n- Both outputs at the same level (both high or both low): the motor terminals are effectively shorted through the bridge. The spinning motor acts as a generator, its back-EMF drives current through its own winding and it brakes.\n- Both outputs off (high impedance): no path for current, the motor coasts to a stop.\n\nThe driver logic never turns on the high and low switch of the same half-bridge at once, because that would short the battery (called shoot-through)."
      },
      {
        heading: "Truth tables of common drivers",
        body:
          "L298N (per the L298 datasheet, for Motor A):\n- ENA high, IN1 high, IN2 low: forward (direction A).\n- ENA high, IN1 low, IN2 high: reverse (direction B).\n- ENA high, IN1 = IN2: fast motor stop (brake).\n- ENA low: free-running stop (coast), inputs ignored.\n\nTB6612FNG (Motor A, STBY must be HIGH):\n- AIN1 high, AIN2 low, PWMA high: clockwise (CW).\n- AIN1 low, AIN2 high, PWMA high: counter-clockwise (CCW).\n- AIN1 high, AIN2 high: short brake.\n- AIN1 low, AIN2 low: stop, outputs off (coast).\n- PWMA low with a direction selected: short brake. So PWM on this chip alternates drive and brake.\n\nDRV8833 uses two PWM-capable inputs per motor instead of a separate enable: one input is held and the other is PWM-ed, which lets you choose drive/coast or drive/brake PWM."
      },
      {
        heading: "Signed speed and mirrored motors",
        body:
          "A clean interface is a single function setMotor(speed) where speed runs from -255 to +255. The sign selects IN1/IN2, and the magnitude goes to analogWrite on the enable pin (Uno PWM pins are 3, 5, 6, 9, 10, 11).\n\nBecause the motors are mounted mirror-image, the same electrical polarity makes them spin in opposite directions relative to the robot. Rather than rewiring, keep a constant such as INVERT_RIGHT = true and negate the speed for that side in software. Then setMotors(200, 200) always means 'forward' and you can trust every higher-level algorithm built on top.\n\nTest direction with the wheels off the ground: command +100 on each side, one at a time, and write down which way each wheel turns before you ever put the robot on the track."
      },
      {
        heading: "Reversing a spinning motor",
        body:
          "While a motor spins it generates a back-EMF E roughly proportional to its speed. Running forward, E opposes the supply, so the winding current is I = (V - E) / R. If you suddenly apply full reverse, the supply and the back-EMF now add: I = (V + E) / R. At full speed E can be close to V, so the reversal current can approach twice the stall current.\n\nWorked example: a motor with winding resistance R = 4 ohm on V = 7.4 V, spinning so that E = 6 V. Forward running current is (7.4 - 6) / 4 = 0.35 A. Instant full reverse gives (7.4 + 6) / 4 = 3.35 A, nearly ten times the running current. That spike can trip a driver's current limit, overheat an L298N, or pull the battery voltage low enough to reset the Arduino. A short brake for a few tens of milliseconds before reversing, or a short ramp, avoids most of the stress."
      }
    ],
    workingPrinciple:
      "Motor direction is set by the polarity of the voltage across the motor. The driver's input pins choose which diagonal pair of H-bridge switches is closed, so current flows through the winding one way or the other, and the motor's torque reverses with the current. The enable/PWM pin controls how much of each PWM period that path is switched on, setting average voltage and therefore speed. Same-level outputs short the winding for braking; disabled outputs let it coast.",
    diagrams: [
      { kind: "pinout", componentId: "l298n", highlight: ["ENA", "IN1", "IN2", "OUT1", "OUT2"] },
      {
        kind: "flow",
        steps: [
          "Read signed speed (-255 to +255)",
          "If this side is mirrored, negate the speed",
          "speed >= 0: IN1 = HIGH, IN2 = LOW",
          "speed < 0: IN1 = LOW, IN2 = HIGH, speed = -speed",
          "analogWrite(EN, constrained magnitude)"
        ]
      }
    ],
    examples: [
      {
        title: "Signed-speed driver for two motors on an L298N",
        body: "One function handles both sides. INVERT_RIGHT compensates for the mirrored mounting so that positive always means forward. ENA and ENB must be on PWM pins (here 9 and 10); remove the ENA/ENB jumpers on the module so the Arduino controls them.",
        code: `const int ENA = 9, IN1 = 7, IN2 = 8;    // left motor
const int ENB = 10, IN3 = 12, IN4 = 13; // right motor
const bool INVERT_LEFT = false;
const bool INVERT_RIGHT = true;

void setMotor(int en, int inA, int inB, int speed, bool invert) {
  if (invert) speed = -speed;
  speed = constrain(speed, -255, 255);
  if (speed >= 0) {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, LOW);
  } else {
    digitalWrite(inA, LOW);
    digitalWrite(inB, HIGH);
    speed = -speed;
  }
  analogWrite(en, speed);
}

void setMotors(int left, int right) {
  setMotor(ENA, IN1, IN2, left, INVERT_LEFT);
  setMotor(ENB, IN3, IN4, right, INVERT_RIGHT);
}

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(ENA, OUTPUT); pinMode(ENB, OUTPUT);
}

void loop() {
  setMotors(180, 180);   // forward
  delay(1000);
  setMotors(0, 0);
  delay(300);
  setMotors(-180, -180); // reverse
  delay(1000);
  setMotors(0, 0);
  delay(300);
}`
      },
      {
        title: "Safe reversal with a short brake",
        body: "Before changing direction at speed, brake briefly so the back-EMF falls before full reverse voltage is applied. On a TB6612FNG, AIN1 = AIN2 = HIGH is a short brake.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8, STBY = 6;

void driveA(int speed) {
  speed = constrain(speed, -255, 255);
  digitalWrite(AIN1, speed >= 0 ? HIGH : LOW);
  digitalWrite(AIN2, speed >= 0 ? LOW : HIGH);
  analogWrite(PWMA, abs(speed));
}

void brakeA() {
  digitalWrite(AIN1, HIGH);
  digitalWrite(AIN2, HIGH);
  analogWrite(PWMA, 255);
}

void setup() {
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMA, OUTPUT); pinMode(STBY, OUTPUT);
  digitalWrite(STBY, HIGH); // leave standby
}

void loop() {
  driveA(220);
  delay(1500);
  brakeA();       // let the motor slow down first
  delay(80);
  driveA(-220);
  delay(1500);
  brakeA();
  delay(80);
}`
      }
    ],
    commonMistakes: [
      { mistake: "Leaving the ENA/ENB jumpers on the L298N while also wiring EN to an Arduino pin.", why: "The jumper ties EN to the module's 5 V, so the motor is always fully enabled and analogWrite has no effect (or fights the 5 V rail).", fix: "Remove the EN jumpers when you want PWM speed control and connect EN to a PWM pin (3, 5, 6, 9, 10 or 11 on the Uno)." },
      { mistake: "Assuming both motors spin forward for the same IN1/IN2 pattern.", why: "The motors are mounted mirror-image, so identical polarity turns one wheel forward and the other backward and the robot spins.", fix: "Test each wheel separately and add an INVERT flag (or swap that motor's two leads) so positive speed is forward on both sides." },
      { mistake: "Slamming from full forward straight into full reverse.", why: "Back-EMF adds to the supply voltage, so the current spike can approach twice stall current, overheating the driver or browning out the Arduino.", fix: "Brake for a few tens of milliseconds or ramp the speed through zero before reversing." },
      { mistake: "Forgetting pinMode(OUTPUT) on IN pins.", why: "digitalWrite on an input pin only switches the weak internal pull-up, which may not drive the driver input properly.", fix: "Call pinMode(pin, OUTPUT) in setup() for every direction pin." }
    ],
    keyTakeaways: [
      "Reversing the current through a brushed DC motor reverses its direction; the H-bridge does this electronically.",
      "IN1/IN2 select direction, the enable/PWM pin sets speed; equal inputs brake on most drivers.",
      "Mirror-mounted motors need one side inverted in software or wiring.",
      "Wrap direction logic in one signed-speed function (-255 to +255) and test with the wheels off the ground.",
      "Brake or ramp before reversing at speed to avoid large current spikes."
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "Arduino Uno R3", "BO Gear Motor", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "H-bridge motor direction control Arduino L298N tutorial",
    quiz: [
      {
        type: "identify-pin",
        prompt: "On an L298N module, which pins choose the direction of Motor A?",
        diagram: { kind: "pinout", componentId: "l298n", highlight: ["IN1", "IN2"] },
        options: ["ENA only", "IN1 and IN2", "IN3 and IN4", "OUT1 and OUT2"],
        answerIndex: 1,
        explanation: "IN1 and IN2 are the logic inputs for Motor A: HIGH/LOW gives one direction and LOW/HIGH the other. ENA only enables the channel (and sets speed via PWM) but cannot reverse it. IN3/IN4 belong to Motor B, and OUT1/OUT2 are the power outputs that go to the motor, not control inputs.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt: "Both motors are wired so that IN-pattern HIGH/LOW means 'wheel forward'. The code sets: left motor IN1 = HIGH, IN2 = LOW; right motor IN3 = LOW, IN4 = HIGH; both enables at 200. What does the robot do?",
        options: [
          "Spins in place to the left (anticlockwise seen from above)",
          "Drives straight forward",
          "Drives straight backward",
          "Spins in place to the right (clockwise seen from above)"
        ],
        answerIndex: 3,
        explanation: "The left wheel drives forward and the right wheel drives backward at the same speed, so the robot rotates about its centre towards the right (clockwise from above). It would only go straight if both wheels had the same direction pattern. A left spin would need the left wheel backward and the right wheel forward.",
        difficulty: 2
      },
      {
        type: "find-wrong-connection",
        prompt: "The code uses analogWrite on the ENA pin to vary speed, but the motor either runs at full speed or stops completely. Which connection in the diagram is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "uno", label: "Arduino Uno", x: 10, y: 50 },
            { id: "drv", label: "L298N", x: 60, y: 50 },
            { id: "bat", label: "7.4 V battery", x: 60, y: 10 },
            { id: "mot", label: "Motor A", x: 95, y: 50 }
          ],
          edges: [
            { from: "uno", to: "drv", label: "D4 -> ENA", color: "#f59e0b", wrong: true },
            { from: "uno", to: "drv", label: "D7 -> IN1", color: "#3b82f6" },
            { from: "uno", to: "drv", label: "D8 -> IN2", color: "#3b82f6" },
            { from: "bat", to: "drv", label: "+ -> 12V, - -> GND", color: "#ef4444" },
            { from: "uno", to: "drv", label: "GND -> GND", color: "#111827" },
            { from: "drv", to: "mot", label: "OUT1/OUT2", color: "#10b981" }
          ]
        },
        options: ["D4 -> ENA", "D7 -> IN1", "D8 -> IN2", "Arduino GND -> L298N GND"],
        answerIndex: 0,
        explanation: "Pin 4 is not a PWM pin on the Uno. analogWrite on a non-PWM pin just writes HIGH for values of 128 or more and LOW below that, so the motor is either fully on or off. Move ENA to 3, 5, 6, 9, 10 or 11. The common ground is correct and necessary, and IN1/IN2 on ordinary digital pins are fine because they only need HIGH/LOW.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does this sketch print on the Serial Monitor?",
        code: `int speed = -300;

void setup() {
  Serial.begin(9600);
  int dir = (speed >= 0) ? 1 : -1;
  int duty = abs(speed);
  if (duty > 255) duty = 255;
  Serial.print(dir);
  Serial.print(" ");
  Serial.println(duty);
}

void loop() {}`,
        options: ["1 255", "-1 300", "-1 255", "255 -1"],
        answerIndex: 2,
        explanation: "speed is negative, so dir = -1. abs(-300) is 300, which is then clamped to 255, the maximum analogWrite duty. The sketch prints dir first, then a space, then duty: '-1 255'. '-1 300' forgets the clamp, and '1 255' ignores the sign.",
        difficulty: 1
      }
    ]
  }),

  // ---------------------------------------------------------------- 16
  defineTopic("race", 16, {
    slug: "differential-steering",
    title: "Differential Steering",
    minutes: 14,
    summary: "How a two-wheel-drive robot steers purely by running its left and right wheels at different speeds, with the kinematic equations to predict the path.",
    introduction:
      "Most club race cars have no steering servo at all. They steer like a tank or a wheelchair: drive the left wheel faster than the right and the robot curves right; reverse one wheel and it spins on the spot. This is called differential steering (or differential drive).\n\nIt is mechanically simple and very agile, but you have to understand the maths to tune it well. In this topic you will learn the two key equations, how to convert motor RPM to wheel speed, how to compute the radius of a turn, and how to 'mix' a forward command and a turn command into left and right motor values.",
    beginner:
      "Imagine you are rowing a boat with two oars. Pull both oars equally and the boat goes straight. Pull the right oar harder and the boat turns left. Push one oar forward while pulling the other back and the boat spins in place. A differential-drive robot does exactly the same thing with its two wheels.\n\nThe robot's forward speed is simply the average of the two wheel speeds. How quickly it turns depends on the difference between them and on how far apart the wheels are. Wheels close together turn the robot quickly for a small speed difference; wheels far apart need a bigger difference for the same rate of turn.\n\nThere are three handy special cases. Equal speeds: straight line. Equal speeds in opposite directions: spin on the spot around the centre point between the wheels. One wheel stopped: pivot around that stopped wheel. Every other combination is a smooth arc somewhere in between.\n\nIn code, you usually think in terms of 'go forward this fast' and 'turn this much'. A tiny bit of arithmetic, called mixing, turns those two numbers into a left speed and a right speed. The catch is that motors have a maximum, so if you ask for more than full speed on one side, the turn gets weaker unless you reduce the forward part.",
    technical: [
      {
        heading: "Kinematic equations",
        body:
          "Let vL and vR be the ground speeds of the left and right wheels (m/s) and b the track width, the distance between the wheel contact patches (m).\n\n- Forward speed of the robot's centre: v = (vL + vR) / 2\n- Angular velocity (positive = turning left/anticlockwise): w = (vR - vL) / b\n- Turn radius of the centre: R = v / w = (b / 2) * (vR + vL) / (vR - vL)\n\nWorked example: b = 0.14 m, vL = 0.4 m/s, vR = 0.6 m/s. Then v = 0.5 m/s, w = 0.2 / 0.14 = 1.43 rad/s, and R = 0.5 / 1.43 = 0.35 m. The robot turns left on a 35 cm radius.\n\nIf vL = -vR, then v = 0 and R = 0: a spin about the centre. If vL = 0, then R = b/2: a pivot about the left wheel."
      },
      {
        heading: "From motor RPM to wheel speed",
        body:
          "Wheel ground speed = wheel RPM x circumference / 60 = RPM x pi x D / 60.\n\nExample: a 300 RPM gear motor with a 65 mm wheel gives 300 x 3.1416 x 0.065 / 60 = 1.02 m/s at no load. Under load the real speed is lower, and two 'identical' motors rarely run at exactly the same speed, which is why an open-loop robot drifts and why encoders or line feedback are needed for straight running.\n\nThe inverse is useful for planning a turn: to follow a radius R at forward speed v, set vL = w(R - b/2) and vR = w(R + b/2) with w = v/R."
      },
      {
        heading: "Mixing and saturation",
        body:
          "Arcade-style mixing: left = base - turn, right = base + turn (for a 'positive turn = left' convention), each clamped to -255..255.\n\nSaturation problem: with base = 220 and turn = 80 you ask for 300 on one side, which is clamped to 255, while the other side gets 140. The intended difference of 160 becomes 115, so the robot turns less than planned exactly when it most needs to turn (fast in a corner).\n\nFix: if either side exceeds the limit, subtract the excess from both sides (or scale both down) so that the difference, which sets the turn rate, is preserved. Good racers deliberately lower base speed when the turn command is large."
      },
      {
        heading: "Scrub and real-world effects",
        body:
          "The equations assume wheels roll without slipping and the contact point is a single line. In reality, wide tyres and any extra driven wheels (4WD skid-steer) must slide sideways during a turn, called scrub. This adds friction torque, so the robot turns less than predicted and the motors draw more current. A front ball caster or omni-wheel lets a 2WD robot follow the kinematic equations much more closely."
      }
    ],
    workingPrinciple:
      "Each wheel pushes its side of the chassis forward at its own ground speed. If the speeds are equal, both sides advance equally and the robot moves straight. If they differ, one side advances further than the other in every instant, so the chassis rotates about a point on the line through the two wheel axles: the instantaneous centre of rotation. The rotation rate equals the speed difference divided by the track width, and the forward speed is the average.",
    diagrams: [
      {
        kind: "formula",
        latexish: "v = (v_L + v_R) / 2;   \\omega = (v_R - v_L) / b;   R = v / \\omega",
        legend: { v: "forward speed of robot centre (m/s)", "v_L, v_R": "left and right wheel ground speeds (m/s)", b: "track width between wheels (m)", "\\omega": "turn rate (rad/s), positive = left", R: "turn radius of the centre (m)" }
      },
      {
        kind: "flow",
        steps: ["Line or path controller outputs base and turn", "left = base - turn, right = base + turn", "If one side > 255, subtract the excess from both", "Send signed speeds to setMotors()"]
      }
    ],
    examples: [
      {
        title: "Arcade mixing that preserves the turn",
        body: "This function mixes a base speed and a turn command and shifts both sides down when one would saturate, keeping the left-right difference intact.",
        code: `void setMotors(int left, int right) {
  // replace with your driver code (see Motor Direction topic)
  Serial.print(left);
  Serial.print(" ");
  Serial.println(right);
}

void drive(int base, int turn) {
  int left = base - turn;
  int right = base + turn;
  int hi = max(left, right);
  if (hi > 255) {
    left -= (hi - 255);
    right -= (hi - 255);
  }
  int lo = min(left, right);
  if (lo < -255) {
    left += (-255 - lo);
    right += (-255 - lo);
  }
  setMotors(constrain(left, -255, 255), constrain(right, -255, 255));
}

void setup() {
  Serial.begin(9600);
  drive(220, 80);  // prints 95 255: difference 160 kept
  drive(150, 0);   // prints 150 150: straight
}

void loop() {}`
      },
      {
        title: "Planning a fixed-radius corner",
        body: "Track width b = 0.12 m. You want the centre of the robot to follow R = 0.30 m at v = 1.0 m/s. Then w = v/R = 3.33 rad/s, inner wheel vL = 3.33 x (0.30 - 0.06) = 0.80 m/s and outer wheel vR = 3.33 x (0.30 + 0.06) = 1.20 m/s. If your top wheel speed is 1.2 m/s, the outer wheel is already at its limit, so this is the fastest this corner can be driven at that radius without raising the motor speed."
      }
    ],
    commonMistakes: [
      { mistake: "Using a large base speed with a large turn command and wondering why the robot runs wide.", why: "One side saturates at 255 and is clamped, so the actual speed difference is smaller than requested.", fix: "Shift or scale both sides when one saturates, or reduce base speed in proportion to the turn command." },
      { mistake: "Measuring track width to the outside edges of the tyres.", why: "The kinematic b is the distance between contact patch centres; the wrong value makes radius predictions wrong.", fix: "Measure centre-to-centre of the tyre treads." },
      { mistake: "Expecting identical PWM to give a perfectly straight line.", why: "Motor-to-motor variation, friction and battery wiring differences make the wheel speeds differ by several percent.", fix: "Use feedback (line sensors or encoders) or a measured trim factor per side." },
      { mistake: "Mixing up the sign convention of the turn command.", why: "If positive turn means left in one function and right in another, the controller pushes the robot away from the line.", fix: "Document one convention (e.g. positive = left/anticlockwise) and test it with a single deliberate turn." }
    ],
    keyTakeaways: [
      "Forward speed is the average of the wheel speeds: v = (vL + vR)/2.",
      "Turn rate is the difference divided by track width: w = (vR - vL)/b.",
      "Equal and opposite speeds spin the robot on the spot; one stopped wheel makes it pivot.",
      "Mixing base and turn must handle saturation or the robot under-steers at speed.",
      "Scrub from wide or extra driven wheels makes real turns weaker than the ideal equations."
    ],
    relatedComponents: ["Arduino Uno R3", "L298N", "TB6612FNG", "BO Gear Motor", "Ball Caster Wheels"],
    youtubeSearch: "differential drive robot kinematics explained turning radius",
    quiz: [
      {
        type: "calculate",
        prompt: "A robot has track width b = 0.15 m. The left wheel moves at 0.3 m/s and the right at 0.6 m/s. What is the turn radius of the robot's centre?",
        diagram: { kind: "formula", latexish: "R = \\frac{b}{2} \\cdot \\frac{v_R + v_L}{v_R - v_L}", legend: { b: "track width", "v_L, v_R": "wheel speeds" } },
        options: ["0.15 m", "0.45 m", "0.225 m", "2.0 m"],
        answerIndex: 2,
        explanation: "v = (0.3 + 0.6)/2 = 0.45 m/s and w = (0.6 - 0.3)/0.15 = 2 rad/s, so R = v/w = 0.45/2 = 0.225 m. 0.45 m is the forward speed number, not the radius, and 2.0 is the turn rate in rad/s.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt: "The left wheel is commanded to +0.5 m/s and the right wheel to -0.5 m/s. How does the robot move?",
        options: [
          "Drives straight at 0.5 m/s",
          "Arcs gently with a large radius",
          "Pivots about the stationary left wheel",
          "Spins on the spot about the midpoint between the wheels"
        ],
        answerIndex: 3,
        explanation: "v = (0.5 + -0.5)/2 = 0, so the centre does not move, while w = (-0.5 - 0.5)/b is non-zero: a pure spin about the midpoint. A pivot about the left wheel would need the left wheel at zero, which is not the case here.",
        difficulty: 1
      },
      {
        type: "mcq",
        prompt: "Why does a differential-drive race car not need a steering servo?",
        options: [
          "Its heading changes whenever the left and right wheels turn at different speeds",
          "The ball caster steers it automatically",
          "The motor driver contains a built-in steering circuit",
          "The track walls guide it around corners"
        ],
        answerIndex: 0,
        explanation: "The difference between left and right wheel speeds produces rotation (w = (vR - vL)/b), so steering is done entirely by the drive motors. A ball caster just swivels to follow the motion; it does not create the turn.",
        difficulty: 1
      },
      {
        type: "code-output",
        prompt: "What does this sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int base = 200;
  int turn = 80;
  int left = constrain(base + turn, -255, 255);
  int right = constrain(base - turn, -255, 255);
  Serial.print(left);
  Serial.print(",");
  Serial.println(right);
}

void loop() {}`,
        options: ["280,120", "255,120", "255,200", "200,120"],
        answerIndex: 1,
        explanation: "base + turn = 280, which constrain clips to 255; base - turn = 120 stays as is. Output: '255,120'. Note the side effect: the requested difference was 160 but the actual difference is only 135, so the robot turns less than intended. '280,120' ignores the constrain.",
        difficulty: 2
      }
    ]
  }),

  // ---------------------------------------------------------------- 17
  defineTopic("race", 17, {
    slug: "encoders",
    title: "Encoders",
    minutes: 15,
    summary: "How wheel and motor encoders turn rotation into pulses, how quadrature gives direction, and how to count them reliably with Arduino interrupts.",
    introduction:
      "Without feedback, your robot only knows what it asked the motors to do, not what they actually did. An encoder is a sensor that produces a pulse every time the shaft turns by a small fixed angle. Count the pulses and you know how far each wheel has travelled; count them per second and you know the speed.\n\nEncoders unlock straight-line driving, accurate distances, speed control that ignores battery voltage, and track-mapping strategies. This topic covers optical and magnetic encoders, quadrature signals, counts-per-revolution maths and interrupt-safe Arduino code.",
    beginner:
      "Imagine walking along a fence and counting the posts as you pass. If the posts are exactly one metre apart, counting 25 posts tells you that you walked 25 metres. If you count how many posts you pass in ten seconds, you also know your speed.\n\nAn encoder does the same for a spinning shaft. A slotted disc (optical encoder) or a small ring magnet (magnetic encoder) turns with the motor. A sensor next to it switches on and off every time a slot or a magnetic pole goes past, producing a stream of pulses. Each pulse is like one fence post.\n\nOne sensor tells you how far, but not which way. So most robot encoders use two sensors placed slightly apart, called channel A and channel B. Their pulses are shifted by a quarter of a cycle. If A changes before B, the wheel is going forward; if B changes before A, it is going backward. This trick is called quadrature.\n\nPulses can arrive thousands of times per second, much faster than your loop() can reliably check. So we use interrupts: the Arduino pauses whatever it is doing for a few microseconds to add one to a counter every time a pulse edge arrives, then carries on.",
    technical: [
      {
        heading: "Encoder types",
        body:
          "- Optical (slotted disc + IR slot sensor): cheap, often fitted to TT motors; resolution set by the number of slots (commonly around 20 per disc). Sensitive to dust and ambient light.\n- Magnetic (Hall sensors + multi-pole ring magnet on the motor shaft): common on N20 and micro metal gear motors; robust and compact. Because it sits on the motor shaft before the gearbox, resolution at the wheel is multiplied by the gear ratio.\n- Outputs are usually open-collector or push-pull digital signals; many need pull-ups (INPUT_PULLUP is often enough) and a 3.3-5 V supply. Always check your module's datasheet for counts per revolution and supply voltage."
      },
      {
        heading: "Counts per revolution and distance",
        body:
          "Counts per wheel revolution: N = CPR_motor x G, where CPR_motor is the counts per motor-shaft revolution (depends on how many edges you count) and G is the gear ratio.\n\nDistance per count: d_count = pi x D / N. Distance travelled: s = counts x pi x D / N.\n\nWorked example: a magnetic encoder giving 12 counts per motor revolution (counting both edges of both channels) on a 30:1 gearbox gives N = 360 counts per wheel revolution. With a 43 mm wheel the circumference is pi x 43 = 135.1 mm, so each count is 0.375 mm. 1000 counts = 375 mm.\n\nDecoding modes: counting only rising edges of A (1x) gives a quarter of the full quadrature resolution; counting both edges of A (2x) gives half; counting both edges of both channels (4x) gives the full count."
      },
      {
        heading: "Quadrature direction logic",
        body:
          "Channels A and B are 90 electrical degrees apart. On a rising edge of A, read B: if B is LOW the shaft is turning one way, if B is HIGH the other way. Which one is 'forward' depends on mounting, so verify by pushing the robot forward by hand and checking the count increases.\n\nThe Uno has two external interrupt pins, 2 (INT0) and 3 (INT1), used with attachInterrupt(digitalPinToInterrupt(pin), isr, mode). For a two-wheel robot you can put channel A of each encoder on pins 2 and 3 and read channel B with digitalRead inside the ISR. (Pin-change interrupts on other pins exist but need register-level code.)"
      },
      {
        heading: "Interrupt-safe counting",
        body:
          "- Declare counters shared with an ISR as volatile so the compiler always reloads them from memory.\n- A long is 4 bytes; the 8-bit AVR reads it in several instructions. If the ISR fires halfway through, you get a torn, nonsense value. Copy the counter inside noInterrupts() / interrupts().\n- Keep ISRs tiny: no Serial, no delay(), no floating point.\n- At high count rates every ISR costs a few microseconds of CPU time; 1x decoding on very high-resolution encoders may be enough for speed control."
      }
    ],
    workingPrinciple:
      "A patterned disc or magnet rotates with the shaft. A fixed sensor converts each passing slot or magnetic pole into a digital transition, so the number of transitions is proportional to the angle turned. A second sensor offset by a quarter cycle produces a phase-shifted copy; the order in which the two channels change reveals the direction. The microcontroller counts transitions with interrupts and converts counts to distance (multiply by wheel circumference / counts per revolution) and to speed (divide by time).",
    diagrams: [
      {
        kind: "signal",
        title: "Quadrature channels A and B (forward rotation)",
        xLabel: "time",
        yLabel: "logic level",
        series: [
          { label: "A", points: [[0, 0], [1, 0], [1, 1], [3, 1], [3, 0], [5, 0], [5, 1], [7, 1], [7, 0], [8, 0]] },
          { label: "B", points: [[0, 0], [2, 0], [2, 1], [4, 1], [4, 0], [6, 0], [6, 1], [8, 1]] }
        ]
      },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D2", "D3"] }
    ],
    examples: [
      {
        title: "Quadrature counter with direction",
        body: "Channel A on interrupt pin 2, channel B on pin 4. The ISR reads B to decide whether to count up or down. The main loop copies the counter atomically before printing.",
        code: `const byte ENC_A = 2;
const byte ENC_B = 4;
volatile long ticks = 0;

void onA() {
  if (digitalRead(ENC_B) == HIGH) ticks--;
  else ticks++;
}

void setup() {
  Serial.begin(115200);
  pinMode(ENC_A, INPUT_PULLUP);
  pinMode(ENC_B, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_A), onA, RISING);
}

void loop() {
  noInterrupts();
  long t = ticks;
  interrupts();
  Serial.println(t);
  delay(100);
}`
      },
      {
        title: "Drive an exact distance",
        body: "Assume calibration showed 360 CHANGE edges on channel A per wheel revolution and a 43 mm wheel, i.e. 0.375 mm per count (measure your own: push the robot exactly 1 m and read the counts). Then 500 mm needs 500 / 0.375 = 1333 counts. The robot drives forward and stops when the average of both encoders reaches the target.",
        code: `volatile long leftTicks = 0, rightTicks = 0;
const float MM_PER_COUNT = 0.375;

void onLeft()  { leftTicks++; }
void onRight() { rightTicks++; }

void setMotors(int l, int r) {
  // your driver code here
}

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(3, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), onLeft, CHANGE);
  attachInterrupt(digitalPinToInterrupt(3), onRight, CHANGE);
  long target = (long)(500 / MM_PER_COUNT);
  setMotors(150, 150);
  while (true) {
    noInterrupts();
    long avg = (leftTicks + rightTicks) / 2;
    interrupts();
    if (avg >= target) break;
  }
  setMotors(0, 0);
}

void loop() {}`
      }
    ],
    commonMistakes: [
      { mistake: "Reading a multi-byte counter in loop() without disabling interrupts.", why: "The ISR can update the variable halfway through the 4-byte read, producing occasional wild values.", fix: "Copy it inside noInterrupts() ... interrupts() and work with the copy." },
      { mistake: "Forgetting that motor-shaft encoders must be multiplied by the gear ratio.", why: "Using the motor CPR as wheel CPR makes every distance and speed off by the gear ratio (e.g. 30x).", fix: "N = CPR_motor x gear ratio, then calibrate by pushing the robot exactly 1 m and comparing counts." },
      { mistake: "Putting Serial.print or delay() inside the ISR.", why: "Serial relies on interrupts and delay() relies on millis, so they can hang or miss counts inside an ISR.", fix: "Only increment/decrement counters in the ISR; do all printing in loop()." },
      { mistake: "Connecting channel A to a pin that is not interrupt-capable on the Uno.", why: "attachInterrupt only works on pins 2 and 3 on the Uno; on other pins nothing is counted.", fix: "Use pins 2 and 3 for the channels you interrupt on." }
    ],
    keyTakeaways: [
      "Encoders turn rotation into pulses; counts give distance and counts per time give speed.",
      "Quadrature (A and B 90 degrees apart) reveals direction from the order of edges.",
      "Counts per wheel revolution = encoder CPR x gear ratio; distance per count = pi x D / N.",
      "On the Uno use interrupt pins 2 and 3, volatile counters, and atomic reads.",
      "Keep ISRs minimal and calibrate counts per metre on the real robot."
    ],
    relatedComponents: ["Magnetic Rotary Encoder", "N20 Micro Metal Gear Motor", "Arduino Uno R3", "Optical Rotary Encoder", "TB6612FNG"],
    youtubeSearch: "quadrature encoder Arduino interrupt tutorial N20 motor",
    quiz: [
      {
        type: "identify-component",
        prompt: "A small board on the back of a gear motor produces two square waves, 90 degrees out of phase, whose frequency rises with motor speed. What is it?",
        diagram: {
          kind: "signal",
          title: "Sensor output",
          xLabel: "time",
          yLabel: "logic level",
          series: [
            { label: "Ch1", points: [[0, 0], [1, 0], [1, 1], [3, 1], [3, 0], [5, 0], [5, 1], [6, 1]] },
            { label: "Ch2", points: [[0, 0], [2, 0], [2, 1], [4, 1], [4, 0], [6, 0]] }
          ]
        },
        options: ["Quadrature encoder", "Ultrasonic distance sensor", "Potentiometer", "IR line sensor"],
        answerIndex: 0,
        explanation: "Two phase-shifted pulse trains whose frequency follows shaft speed are the signature of a quadrature encoder. A potentiometer gives a continuously varying analog voltage, not pulses, and line or ultrasonic sensors do not depend on motor rotation.",
        difficulty: 1
      },
      {
        type: "calculate",
        prompt: "An encoder setup gives 360 counts per wheel revolution. The wheel diameter is 40 mm. After a run you read 900 counts. How far did the wheel travel?",
        options: ["126 mm", "226 mm", "900 mm", "about 314 mm"],
        answerIndex: 3,
        explanation: "900 / 360 = 2.5 revolutions. Circumference = pi x 40 = 125.7 mm, so distance = 2.5 x 125.7 = 314 mm. 126 mm is just one revolution, and 900 mm wrongly assumes one count per millimetre.",
        difficulty: 2
      },
      {
        type: "debug-code",
        prompt: "This speed printer occasionally prints huge, impossible numbers. Which change fixes the real problem?",
        code: `long ticks = 0;

void onA() { ticks++; }

void setup() {
  Serial.begin(115200);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), onA, RISING);
}

void loop() {
  long last = ticks;
  delay(100);
  Serial.println(ticks - last);
}`,
        options: [
          "Change RISING to LOW",
          "Declare ticks as volatile and copy it inside noInterrupts()/interrupts() before using it",
          "Move the encoder to pin 7",
          "Add Serial.println inside onA() to check it runs"
        ],
        answerIndex: 1,
        explanation: "ticks is shared with an ISR, so it must be volatile, and because a long is 4 bytes the AVR reads it in several steps; an interrupt in the middle gives a torn value, which shows up as an occasional huge number. LOW mode would fire continuously while the pin is low, pin 7 cannot use attachInterrupt on the Uno, and Serial inside an ISR can hang.",
        difficulty: 3
      },
      {
        type: "identify-pin",
        prompt: "On an Arduino Uno, which pins can you use with attachInterrupt() for encoder channels?",
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D2", "D3"] },
        options: ["A0 and A1", "9 and 10", "2 and 3", "Any pin from 4 to 13"],
        answerIndex: 2,
        explanation: "The ATmega328P's external interrupts INT0 and INT1 are on digital pins 2 and 3, and those are the only pins attachInterrupt supports on the Uno. Pins 9 and 10 are PWM pins, not interrupt pins, so they are a tempting wrong answer.",
        difficulty: 1
      }
    ]
  })
];
