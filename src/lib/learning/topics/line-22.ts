import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_22: Topic[] = [
  defineTopic("line", 22, {
    slug: "l298n",
    title: "L298N",
    minutes: 14,
    summary: "Pin-by-pin guide to the L298N dual H-bridge module: power jumpers, direction and speed control, and its voltage-drop penalty.",
    introduction:
      "The red L298N module is the first motor driver most clubs use. It is cheap, tolerant of mistakes and drives two DC motor channels. On the club's 4WD robots, the left motor pair is wired in parallel on one channel and the right pair on the other. It also has quirks that confuse beginners: a 5 V jumper that can either power or destroy things, enable jumpers that must be removed for speed control, and a voltage drop that makes robots slower than expected.",
    beginner:
      "Think of the L298N as a pair of traffic police for electricity. Your Arduino is the city council: it is clever but weak, and it cannot carry the heavy traffic (current) that motors need. The council sends small hand signals to the police, and the police direct the heavy traffic from the battery to the motors.\n\nThe board has three kinds of terminals. The big screw terminals take battery power in and send motor power out. The small pins labelled IN1 to IN4 are the direction signals: for each motor, one pin HIGH and the other LOW makes it spin one way, and swapping them spins it the other way. The ENA and ENB pins are the speed signals: feed them PWM from the Arduino and the motor goes faster or slower.\n\nThe L298N is an older design built with bipolar transistors, and those transistors 'eat' about 2 volts of your battery before the motor gets anything. So if you feed it 7.4 V, the motors only see roughly 5.4 V at moderate current, and the missing energy turns into heat in the big black heatsink. It works, but it is not efficient — which is why faster robots later switch to MOSFET drivers.",
    technical: [
      {
        heading: "Module pinout",
        body:
          "- +12V (VS): motor supply input. The L298 chip itself accepts up to 46 V, but the module's onboard 5 V regulator limits what you should feed with the jumper fitted (see below).\n- GND: common ground — must also connect to Arduino GND.\n- +5V: either an output of the onboard regulator (jumper fitted) or an input for logic power (jumper removed).\n- OUT1/OUT2: motor A. OUT3/OUT4: motor B.\n- ENA, IN1, IN2: control motor A. ENB, IN3, IN4: control motor B.\n\nENA and ENB normally ship with jumpers to +5 V, which means 'always enabled at full speed'. Remove the jumper and connect the pin to an Arduino PWM pin (3, 5, 6, 9, 10 or 11 on the Uno) to control speed.",
      },
      {
        heading: "The 5 V regulator jumper",
        body:
          "With the regulator jumper fitted, an onboard 78M05 regulator makes 5 V from VS and the +5V terminal becomes an output. This is the normal setting for battery voltages up to about 12 V. For higher voltages, remove the jumper (the regulator would overheat or fail) and supply 5 V to the +5V terminal from the Arduino or a separate regulator.\n\nNever connect a battery directly to the +5V terminal: it feeds the logic circuitry directly and anything well above 5 V can damage it.",
      },
      {
        heading: "Truth table and voltage drop",
        body:
          "For motor A (motor B identical with ENB/IN3/IN4):\n\n- ENA HIGH, IN1 HIGH, IN2 LOW → forward\n- ENA HIGH, IN1 LOW, IN2 HIGH → reverse\n- ENA HIGH, IN1 = IN2 → fast stop (brake)\n- ENA LOW → free-running stop (coast)\n\nThe L298 uses bipolar transistors in a Darlington-style arrangement; two conduct in series with the motor, and the total drop is typically around 2 V at 1 A (more at higher current). Worked example: 7.4 V battery, 1 A motor current → about 5.4 V at the motor and about 2 V × 1 A = 2 W of heat per channel. On a 2-cell pack that loss is more than a quarter of the battery voltage.\n\nThe module is commonly rated around 2 A per channel with its heatsink, but low-voltage robots usually hit the voltage-drop problem long before the current limit.",
      },
    ],
    workingPrinciple:
      "The L298 contains two H-bridges. IN1/IN2 (and IN3/IN4) select which diagonal transistor pair conducts, setting motor direction; IN pins equal gives braking. The enable pin gates the whole bridge on and off, so a PWM signal on ENA/ENB sets the average motor voltage and hence speed.",
    diagrams: [
      { kind: "pinout", componentId: "l298n", highlight: ["ENA", "IN1", "IN2", "IN3", "IN4", "ENB", "VS", "GND", "5V"] },
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "7.4 V battery", x: 0, y: 0 },
          { id: "drv", label: "L298N", x: 2, y: 1 },
          { id: "uno", label: "Arduino Uno", x: 4, y: 1 },
          { id: "ml", label: "Left motor", x: 2, y: 3 },
          { id: "mr", label: "Right motor", x: 3, y: 3 },
        ],
        edges: [
          { from: "bat", to: "drv", label: "+ → +12V, − → GND", color: "red" },
          { from: "drv", to: "uno", label: "GND ↔ GND (common ground)", color: "black" },
          { from: "uno", to: "drv", label: "D5→ENA, D4→IN1, D7→IN2, D6→ENB, D8→IN3, D12→IN4", color: "green" },
          { from: "drv", to: "ml", label: "OUT1/OUT2" },
          { from: "drv", to: "mr", label: "OUT3/OUT4" },
        ],
      },
    ],
    examples: [
      {
        title: "Two-motor control functions",
        body: "This complete sketch drives both motors with signed speeds from −255 to 255. Negative values reverse the motor. ENA and ENB are on PWM pins 5 and 6.",
        code: `const int ENA = 5;
const int IN1 = 4;
const int IN2 = 7;
const int ENB = 6;
const int IN3 = 8;
const int IN4 = 12;

void setMotor(int en, int inA, int inB, int speed) {
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

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  setMotor(ENA, IN1, IN2, 180);   // left forward
  setMotor(ENB, IN3, IN4, 180);   // right forward
  delay(1000);
  setMotor(ENA, IN1, IN2, -120);  // spin
  setMotor(ENB, IN3, IN4, 120);
  delay(500);
}`,
      },
      {
        title: "Measuring the voltage drop yourself",
        body: "Run one motor forward with ENA at 255. Measure the battery voltage at the +12V terminal and the voltage across OUT1/OUT2 with a multimeter. The difference is the driver's drop at that current. Repeat while gently loading the wheel with your finger: the drop grows as current rises, which is the main reason robots feel sluggish on an L298N with a low-voltage battery.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Leaving the ENA/ENB jumpers in place and wondering why analogWrite does nothing.",
        why: "The jumper ties enable permanently HIGH, so the motor always runs at full speed regardless of your PWM pin.",
        fix: "Remove the ENA/ENB jumpers and wire them to Arduino PWM pins.",
      },
      {
        mistake: "Forgetting to connect Arduino GND to L298N GND.",
        why: "The IN/EN signals are voltages relative to ground; without a shared reference the driver sees random levels.",
        fix: "Always run a ground wire between the Arduino and the driver.",
      },
      {
        mistake: "Feeding more than about 12 V with the regulator jumper fitted, or connecting a battery to the +5V pin.",
        why: "The onboard regulator overheats at high input voltage, and the +5V pin feeds logic directly, so over-voltage damages it.",
        fix: "Remove the jumper above about 12 V and supply clean 5 V; only ever connect the battery to the +12V (VS) terminal.",
      },
      {
        mistake: "Using a 1S (3.7 V) battery with an L298N.",
        why: "After roughly 2 V of drop, the motors receive under 2 V and barely turn.",
        fix: "Use a higher-voltage pack or switch to a low-drop MOSFET driver like the TB6612FNG or DRV8833.",
      },
    ],
    keyTakeaways: [
      "IN1/IN2 set direction, ENA sets speed via PWM; the same for IN3/IN4/ENB.",
      "Remove the enable jumpers to use PWM speed control.",
      "Keep the regulator jumper only for supplies up to about 12 V; never put battery voltage on +5V.",
      "Expect around 2 V lost in the driver at 1 A, turned into heat.",
      "Always share ground between the Arduino and the driver.",
    ],
    relatedComponents: ["L298N", "Arduino Uno R3", "TT Yellow Gear Motor", "18650 Li-ion Cell"],
    youtubeSearch: "L298N motor driver Arduino tutorial ENA jumper PWM",
    quiz: [
      {
        type: "identify-pin",
        prompt: "On the L298N module, which pin's jumper must be removed so that the Arduino can control motor A's speed with PWM?",
        diagram: { kind: "pinout", componentId: "l298n", highlight: ["ENA"] },
        options: ["IN1", "+5V", "OUT1", "ENA"],
        answerIndex: 3,
        explanation: "ENA is the enable for bridge A; its jumper ties it to 5 V (always full on). Removing it lets you feed PWM. IN1 sets direction, not speed, and OUT1 is a motor output, not a control pin.",
        difficulty: 1,
      },
      {
        type: "identify-driver",
        prompt: "A dual motor driver module has a large black heatsink, an onboard 5 V regulator with a jumper, ENA/ENB jumpers, and loses roughly 2 V between battery and motor at 1 A. Which driver is it?",
        options: ["L298N", "TB6612FNG", "DRV8833", "Relay module"],
        answerIndex: 0,
        explanation: "These are the signature features of the bipolar L298N module. The TB6612FNG and DRV8833 are small MOSFET drivers without heatsinks or onboard regulators and with much lower drop. A relay module cannot do PWM speed control.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A robot uses a 2S Li-ion pack at 7.4 V and an L298N. Each motor draws about 1 A. Using the typical drop of about 2 V at 1 A, what voltage reaches each motor at full duty?",
        options: ["7.4 V", "9.4 V", "3.7 V", "About 5.4 V"],
        answerIndex: 3,
        explanation: "7.4 V − 2 V ≈ 5.4 V. The driver cannot add voltage (so 9.4 V is impossible), and 7.4 V would only apply with a near-ideal MOSFET driver. 3.7 V is a single cell's nominal voltage, not relevant here.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "Which connection in this L298N wiring is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "bat", label: "3S LiPo 11.1 V", x: 0, y: 0 },
            { id: "v12", label: "L298N +12V", x: 2, y: 0 },
            { id: "v5", label: "L298N +5V", x: 2, y: 1 },
            { id: "gnd", label: "L298N GND", x: 2, y: 2 },
            { id: "ugnd", label: "Uno GND", x: 4, y: 2 },
            { id: "ud5", label: "Uno D5", x: 4, y: 3 },
            { id: "ena", label: "L298N ENA", x: 2, y: 3 },
          ],
          edges: [
            { from: "bat", to: "v5", label: "battery +", wrong: true, color: "red" },
            { from: "bat", to: "gnd", label: "battery −", color: "black" },
            { from: "gnd", to: "ugnd", color: "black" },
            { from: "ud5", to: "ena", color: "green" },
          ],
        },
        options: [
          "Battery + connected to the +5V terminal instead of +12V",
          "Battery − connected to L298N GND",
          "L298N GND connected to Uno GND",
          "Uno D5 connected to ENA",
        ],
        answerIndex: 0,
        explanation: "The +5V terminal is the logic supply (or regulator output). 11.1 V there over-volts the logic and can destroy the board; the battery belongs on +12V (VS). Sharing GND and using PWM pin D5 for ENA are both correct.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "The ENA jumper is removed and ENA is wired to pin 8. The motor is either stopped or at full speed — never in between. What is the bug?",
        code: `const int ENA = 8;
const int IN1 = 4;
const int IN2 = 7;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void loop() {
  for (int s = 0; s <= 255; s += 5) {
    analogWrite(ENA, s);
    delay(50);
  }
}`,
        options: [
          "IN1 and IN2 should both be HIGH",
          "The for loop never ends",
          "pinMode must not be used before analogWrite",
          "Pin 8 is not a PWM pin on the Uno, so analogWrite only gives LOW or HIGH",
        ],
        answerIndex: 3,
        explanation: "On the Uno only pins 3, 5, 6, 9, 10 and 11 support PWM. On other pins analogWrite() just writes LOW for values below 128 and HIGH for 128 and above, giving stop/full-speed. Move ENA to a PWM pin such as 5. Setting IN1 = IN2 would brake the motor, not fix speed control.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 23, {
    slug: "other-motor-drivers",
    title: "Other Motor Drivers",
    minutes: 13,
    summary: "TB6612FNG, DRV8833 and L293D compared: control pins, voltage ranges and why MOSFET drivers make line followers faster.",
    introduction:
      "Once your robot works on an L298N, the next upgrade is usually the motor driver. Small MOSFET drivers such as the TB6612FNG and DRV8833 waste far less voltage, weigh a few grams and fit on tiny chassis. Each has its own control scheme, and mixing them up is a common source of 'my motor does nothing' bugs.",
    beginner:
      "Imagine two water pipes feeding a garden. One pipe is narrow and rusty: lots of pressure is lost along the way, so the hose at the end only dribbles. The other is wide and smooth: almost all of the pressure reaches the hose. Both pipes 'work', but one wastes much more of the pump's effort.\n\nThe L298N is like the narrow pipe — it loses about 2 volts. MOSFET drivers like the TB6612FNG and DRV8833 are the wide pipe. Their switches behave like very small resistances, so at the currents small gearmotors use, they lose only a fraction of a volt. Your motors get more of the battery, run faster, and the driver stays cool without a heatsink.\n\nThe catch is that every driver has its own 'language'. The TB6612FNG has a separate PWM pin per motor plus a STBY (standby) pin that must be HIGH or nothing happens. The DRV8833 has no separate speed pin: you send PWM straight into one of its two input pins. Learn the truth table of the driver you use, and your code becomes a small translation layer between 'go left at 60 %' and the right pin pattern.",
    technical: [
      {
        heading: "TB6612FNG",
        body:
          "Dual MOSFET H-bridge from Toshiba. Commonly cited ratings: motor supply VM up to 13.5 V recommended (15 V absolute maximum), logic supply VCC 2.7–5.5 V, about 1.2 A average and 3.2 A peak per channel.\n\nPins: VM, VCC, GND, STBY, PWMA, AIN1, AIN2, AO1, AO2, PWMB, BIN1, BIN2, BO1, BO2.\n\nTruth table (per channel, with STBY HIGH):\n- IN1 H, IN2 L, PWM H → forward\n- IN1 L, IN2 H, PWM H → reverse\n- IN1 H, IN2 H → short brake\n- IN1 L, IN2 L, PWM H → stop (outputs off, coast)\n- PWM L → short brake\n\nBecause PWM LOW means brake, PWM speed control on the TB6612FNG is drive/brake, which gives speed fairly proportional to duty cycle. STBY LOW puts the whole chip in standby.",
      },
      {
        heading: "DRV8833",
        body:
          "Dual MOSFET H-bridge from Texas Instruments for low-voltage motors: motor supply 2.7–10.8 V, so it runs directly from 1S or 2S lithium packs. It has a sleep pin (nSLEEP, active-low: HIGH = awake; many breakout boards pull it up) and a fault output (nFAULT).\n\nEach bridge has just two inputs, xIN1 and xIN2:\n- 0, 0 → coast\n- 1, 0 → forward\n- 0, 1 → reverse\n- 1, 1 → brake\n\nThere is no separate enable: for speed control, apply PWM to one input while holding the other LOW (drive/coast), or hold one input HIGH and PWM the other with inverted duty (drive/brake). That needs two PWM-capable pins per motor if you want both directions with variable speed.",
      },
      {
        heading: "L293D and choosing a driver",
        body:
          "The L293D is a classic quad half-bridge in a DIP-16 package with built-in clamp diodes. It is rated around 600 mA per channel continuous and, like the L298N, uses bipolar transistors, so its voltage drop is large. It suits very small motors and breadboard experiments.\n\nChoosing:\n- 1S–2S lithium, small N20 or TT motors, under about 1 A: DRV8833 or TB6612FNG.\n- Higher voltage (above ~13 V) or need for a rugged learning board: L298N.\n- Large motors with many amps (sumo, heavy racers): dedicated high-current drivers, chosen by stall current with margin.\n\nWorked comparison at 1 A: if a MOSFET driver's path resistance totals 0.5 Ω, it drops 0.5 V and wastes 0.5 W; the L298N drops about 2 V and wastes about 2 W.",
      },
    ],
    workingPrinciple:
      "MOSFET drivers use transistors that, when fully on, behave like small resistors (R_DS(on)) rather than fixed voltage drops. The control logic decodes the input pins into the four H-bridge states — forward, reverse, brake, coast — and PWM on the appropriate pin rapidly switches between drive and brake or coast to set average motor voltage.",
    diagrams: [
      { kind: "pinout", componentId: "tb6612fng", highlight: ["STBY", "PWMA", "AIN1", "AIN2", "VM", "VCC"] },
      {
        kind: "flow",
        steps: [
          "What battery voltage? (>10.8 V rules out DRV8833; >13.5 V rules out TB6612FNG)",
          "What stall current per motor? Choose a driver whose peak rating exceeds it",
          "How many PWM pins are free? (DRV8833 needs PWM on IN pins; TB6612FNG uses PWMA/PWMB)",
          "Is weight or size critical? Prefer small MOSFET breakouts",
          "Write a setMotor(speed) function for that driver's truth table",
        ],
      },
    ],
    examples: [
      {
        title: "TB6612FNG signed-speed function",
        body: "STBY is driven HIGH in setup(). PWMA on pin 5 sets speed; AIN1/AIN2 set direction.",
        code: `const int STBY = 9;
const int PWMA = 5;
const int AIN1 = 7;
const int AIN2 = 8;

void motorA(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed >= 0) {
    digitalWrite(AIN1, HIGH);
    digitalWrite(AIN2, LOW);
  } else {
    digitalWrite(AIN1, LOW);
    digitalWrite(AIN2, HIGH);
    speed = -speed;
  }
  analogWrite(PWMA, speed);
}

void setup() {
  pinMode(STBY, OUTPUT);
  pinMode(PWMA, OUTPUT);
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  digitalWrite(STBY, HIGH);   // wake the driver
}

void loop() {
  motorA(200);
  delay(1000);
  motorA(-200);
  delay(1000);
}`,
      },
      {
        title: "DRV8833 with PWM on the input pins",
        body: "Both inputs of the bridge are on PWM pins (9 and 10). For forward, PWM AIN1 and hold AIN2 LOW; for reverse, the opposite. Writing 0 to both lets the motor coast.",
        code: `const int AIN1 = 9;
const int AIN2 = 10;

void motorA(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed >= 0) {
    analogWrite(AIN1, speed);
    analogWrite(AIN2, 0);
  } else {
    analogWrite(AIN1, 0);
    analogWrite(AIN2, -speed);
  }
}

void setup() {
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
}

void loop() {
  motorA(150);
  delay(1000);
  motorA(0);
  delay(500);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Leaving the TB6612FNG STBY pin unconnected.",
        why: "STBY must be HIGH for the outputs to work; floating or LOW keeps the chip in standby.",
        fix: "Tie STBY to VCC or drive it HIGH from a pin in setup().",
      },
      {
        mistake: "Running a DRV8833 from a 3S pack.",
        why: "A charged 3S pack is about 12.6 V, above the DRV8833's 10.8 V maximum motor supply.",
        fix: "Use 1S or 2S packs with the DRV8833, or a driver rated for higher voltage.",
      },
      {
        mistake: "Copying L298N code (with an enable pin) to a DRV8833.",
        why: "The DRV8833 has no enable pin; speed is set by PWM on the IN pins, so the old code only gives full speed or nothing.",
        fix: "Rewrite the motor function using the DRV8833 truth table and PWM-capable IN pins.",
      },
      {
        mistake: "Mixing up VM and VCC on the TB6612FNG.",
        why: "VCC is logic (2.7–5.5 V); putting motor battery voltage on it can destroy the chip.",
        fix: "Battery to VM, Arduino 5 V (or 3.3 V) to VCC, and common ground.",
      },
    ],
    keyTakeaways: [
      "MOSFET drivers (TB6612FNG, DRV8833) drop far less voltage than the L298N or L293D.",
      "TB6612FNG: separate PWMx pin per motor, IN1/IN2 for direction, STBY must be HIGH.",
      "DRV8833: 2.7–10.8 V motor supply, two inputs per bridge, PWM goes on an input pin.",
      "Choose a driver by battery voltage, stall current, pin budget and size.",
      "Write one setMotor() function per driver so the rest of the code does not care which one you use.",
    ],
    relatedComponents: ["TB6612FNG", "DRV8833", "L293D", "L298N", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "TB6612FNG vs DRV8833 vs L298N motor driver comparison",
    quiz: [
      {
        type: "identify-driver",
        prompt: "A small MOSFET dual driver has pins PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, VM, VCC and a STBY pin that must be HIGH for the outputs to work. Which driver is it?",
        options: ["L298N", "DRV8833", "L293D", "TB6612FNG"],
        answerIndex: 3,
        explanation: "Separate PWMA/PWMB pins plus STBY are characteristic of the TB6612FNG. The DRV8833 has only xIN1/xIN2 inputs and a nSLEEP pin; the L298N uses ENA/ENB and has no standby pin.",
        difficulty: 1,
      },
      {
        type: "identify-driver",
        prompt: "Which driver runs from a 2.7–10.8 V motor supply, has an nSLEEP pin, and has only two input pins per H-bridge with no separate enable or PWM pin?",
        options: ["DRV8833", "TB6612FNG", "L298N", "L293D"],
        answerIndex: 0,
        explanation: "That is the DRV8833: speed control is done by PWM on xIN1 or xIN2. The TB6612FNG has dedicated PWM pins; the L298N has ENA/ENB enable pins and accepts much higher voltages.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why does switching from an L298N to a TB6612FNG often make a 2S line follower noticeably faster at the same PWM?",
        options: [
          "The TB6612FNG increases the battery voltage",
          "The TB6612FNG uses a higher PWM frequency, which adds torque",
          "The TB6612FNG has an onboard regulator",
          "Its MOSFET switches drop much less voltage than the L298N's bipolar transistors",
        ],
        answerIndex: 3,
        explanation: "With about 2 V lost in an L298N, a 7.4 V pack delivers roughly 5.4 V; a MOSFET driver delivers much closer to the full 7.4 V. No driver raises the supply voltage, and PWM frequency does not add torque.",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt: "A TB6612FNG is wired correctly to the Arduino, VM and VCC are powered, AIN1/AIN2/PWMA are driven correctly, but the motor never moves. Which pin is most likely the problem?",
        diagram: { kind: "pinout", componentId: "tb6612fng", highlight: ["STBY"] },
        options: ["STBY", "AO1", "BIN2", "PWMB"],
        answerIndex: 0,
        explanation: "If STBY is LOW or floating, the chip stays in standby and all outputs are off. BIN2 and PWMB belong to motor B, so they cannot stop motor A, and AO1 is a motor output, not a control input.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 24, {
    slug: "power-systems",
    title: "Power Systems",
    minutes: 14,
    summary: "Batteries, voltage rails, regulators, grounding and decoupling for a line follower that never resets mid-run.",
    introduction:
      "A surprising number of 'software bugs' in robotics are power problems: the Arduino resets when the motors start, sensors read differently as the battery drains, or a regulator gets too hot to touch. This topic builds a reliable power system: choosing a battery, splitting motor and logic power, sharing ground, adding capacitors and monitoring voltage.",
    beginner:
      "Think of your robot's battery as a water tank on a roof, feeding a house. The motors are like a washing machine that suddenly gulps a lot of water when it starts. If the kitchen tap (the Arduino) shares the same thin pipe, the tap's pressure drops every time the machine starts — and the Arduino, starved of voltage for a moment, restarts. That is called a brownout.\n\nGood power design is like good plumbing. Use a tank big enough for the job (battery capacity in mAh). Give the delicate kitchen tap a steady supply through a pressure regulator (a voltage regulator making clean 5 V). Put small storage tanks near the hungry machine (capacitors near the motor driver) so short gulps come from them instead of the main pipe. And make sure all the drains connect to the same sewer (common ground), otherwise signals have no shared reference.\n\nLithium batteries are the usual choice because they are light and powerful, but they demand respect: charge them only with the right charger, never let them run completely flat, and never puncture or short-circuit them.",
    technical: [
      {
        heading: "Lithium cells in numbers",
        body:
          "Li-ion (e.g. 18650) and LiPo cells share the same basic chemistry: about 3.7 V nominal, 4.2 V fully charged, and they should not be discharged below roughly 3.0 V per cell. Packs are named by series cells:\n\n- 1S: 3.7 V nominal (4.2 V full)\n- 2S: 7.4 V nominal (8.4 V full)\n- 3S: 11.1 V nominal (12.6 V full)\n\nCapacity in mAh sets runtime: t ≈ capacity / average current. A 2200 mAh pack at an average 1.1 A lasts about 2 hours in theory; real usable time is lower because you stop before the cells are empty and capacity falls at high current.\n\nEvery battery has internal resistance, so its terminal voltage sags under load: V = V_open − I × R_internal. With 0.2 Ω total and a 3 A start-up surge, the pack sags 0.6 V at that moment.",
      },
      {
        heading: "Rails and regulators",
        body:
          "The Arduino Uno can be powered by:\n\n- USB (5 V)\n- The barrel jack or VIN pin through its onboard linear regulator; the recommended input range is 7–12 V.\n- The 5V pin directly with a regulated 5 V supply, which bypasses the regulator (no protection, so it must be clean and correct).\n\nA linear regulator burns the extra voltage as heat: P = (Vin − Vout) × I. Dropping 12 V to 5 V at 0.2 A wastes 1.4 W. A buck (step-down) converter is far more efficient for larger currents.\n\nMotor power goes straight from the battery to the driver's motor supply pin. Logic power comes from a regulator. The two rails must share ground.",
      },
      {
        heading: "Decoupling, wiring and protection",
        body:
          "- Bulk capacitor: an electrolytic (often in the 100–470 µF range, rated above the battery voltage) at the motor driver's supply terminals supplies current surges locally.\n- Small ceramic capacitors (0.1 µF) across each motor's terminals and near each IC's supply pins absorb high-frequency noise.\n- Star grounding: run motor ground and logic ground back to one point rather than daisy-chaining through the Arduino.\n- A power switch and, ideally, a fuse in the battery lead protect against shorts.\n\nBattery monitoring: a voltage divider scales the pack voltage into the 0–5 V ADC range. For a 2S pack (8.4 V max), two equal 10 kΩ resistors give 4.2 V at full charge, reading about 4.2 / 5 × 1023 ≈ 859.",
      },
    ],
    workingPrinciple:
      "The battery provides energy; motor current flows on a short, thick path from battery to driver to motors, while the logic receives regulated 5 V. Capacitors supply fast current surges locally so the battery's voltage sag and wire inductance do not disturb the logic, and a common ground gives every signal the same reference.",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "2S Li-ion 7.4 V", x: 0, y: 1 },
          { id: "sw", label: "Switch + fuse", x: 1, y: 1 },
          { id: "cap", label: "470 µF bulk cap", x: 2, y: 0 },
          { id: "drv", label: "Motor driver VM", x: 3, y: 0 },
          { id: "uno", label: "Uno VIN (regulator)", x: 3, y: 2 },
          { id: "gnd", label: "Star ground", x: 2, y: 3 },
        ],
        edges: [
          { from: "bat", to: "sw", color: "red" },
          { from: "sw", to: "cap", color: "red" },
          { from: "cap", to: "drv", label: "motor rail", color: "red" },
          { from: "sw", to: "uno", label: "logic via regulator", color: "orange" },
          { from: "drv", to: "gnd", color: "black" },
          { from: "uno", to: "gnd", color: "black" },
          { from: "bat", to: "gnd", label: "battery −", color: "black" },
        ],
      },
      {
        kind: "formula",
        latexish: "V_{ADC} = V_{bat} \\cdot \\frac{R_2}{R_1 + R_2}",
        legend: { V_bat: "battery voltage", R1: "top resistor", R2: "bottom resistor (to GND)", V_ADC: "voltage at the analog pin (must stay ≤ 5 V)" },
      },
    ],
    examples: [
      {
        title: "Battery voltage monitor",
        body: "Two 10 kΩ resistors divide a 2S pack's voltage by 2 into A5. The sketch converts back to pack voltage and warns below 6.6 V (3.3 V per cell, a conservative stop point).",
        code: `const int BAT_PIN = A5;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(BAT_PIN);
  float vPin = raw * 5.0 / 1023.0;
  float vBat = vPin * 2.0;          // 10k / 10k divider
  Serial.print("Battery: ");
  Serial.println(vBat);
  if (vBat < 6.6) {
    Serial.println("LOW BATTERY - stop and charge");
  }
  delay(1000);
}`,
      },
      {
        title: "Diagnosing a brownout",
        body: "Print a message in setup() such as 'BOOT'. If you see 'BOOT' again every time the motors start, the Arduino is resetting. Fixes, in order: add a bulk capacitor at the driver, shorten and thicken motor power wires, soft-start the motors with a PWM ramp, and power the logic from its own regulator or a separate cell pack with a common ground.",
      },
    ],
    commonMistakes: [
      {
        mistake: "Powering the Arduino and motors from the same 5 V pin or USB.",
        why: "Motor surges pull the 5 V rail down and inject noise, causing resets and erratic sensor readings.",
        fix: "Feed motors from the battery through the driver; feed logic through a regulator; share ground.",
      },
      {
        mistake: "Connecting a 2S pack (up to 8.4 V) to the Arduino's 5V pin.",
        why: "The 5V pin bypasses the regulator, so 8.4 V goes straight to the microcontroller and can destroy it.",
        fix: "Use VIN or the barrel jack (7–12 V) or a 5 V regulator/buck converter.",
      },
      {
        mistake: "Over-discharging lithium cells.",
        why: "Discharging below about 3.0 V per cell damages the cell and can make it unsafe to recharge.",
        fix: "Monitor pack voltage and stop well before 3.0 V per cell; charge with a proper balance charger.",
      },
    ],
    keyTakeaways: [
      "Lithium cells: 3.7 V nominal, 4.2 V full, do not go below about 3.0 V; 2S = 7.4 V nominal.",
      "Runtime ≈ capacity / average current; voltage sags under load due to internal resistance.",
      "Keep motor and logic rails separate but always connect their grounds.",
      "Bulk and ceramic capacitors stop brownouts and noise.",
      "Never put battery voltage on the Arduino 5V pin; VIN expects 7–12 V.",
    ],
    relatedComponents: ["18650 Li-ion Cell", "LiPo 2S Battery", "LM2596 Buck Converter", "Arduino Uno R3", "L298N"],
    youtubeSearch: "robot power system Arduino brownout motor noise capacitor common ground",
    quiz: [
      {
        type: "calculate",
        prompt: "A line follower draws an average of 1.1 A from a 2200 mAh pack. What is the theoretical runtime?",
        options: ["About 0.5 h", "About 20 h", "About 1.1 h", "About 2 h"],
        answerIndex: 3,
        explanation: "t = 2200 mAh / 1100 mA = 2 h. 0.5 h comes from dividing the wrong way (1.1 / 2.2). Real runtime is shorter, because you stop before the pack is empty.",
        difficulty: 1,
      },
      {
        type: "predict-circuit",
        prompt: "An Arduino and an L298N share one battery with long thin wires and no capacitors. The battery has noticeable internal resistance. What is most likely to happen when both motors start from standstill at full PWM?",
        options: [
          "The supply voltage dips briefly and the Arduino may reset (brownout)",
          "The battery voltage rises because the motors generate back-EMF",
          "Nothing, because the L298N isolates the Arduino from the motors",
          "The motors start slowly because the driver limits current to 100 mA",
        ],
        answerIndex: 0,
        explanation: "Start-up current is near the stall current, so V = V_open − I × R_internal falls sharply and the wires add more drop. If the logic supply dips too low, the microcontroller resets. Back-EMF is zero at standstill, and the L298N does not isolate supplies or limit current to 100 mA.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "Which connection in this power layout is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "bat", label: "2S pack (8.4 V full)", x: 0, y: 1 },
            { id: "vm", label: "Driver VM", x: 2, y: 0 },
            { id: "u5", label: "Uno 5V pin", x: 2, y: 2 },
            { id: "gnd", label: "Common GND", x: 1, y: 3 },
            { id: "cap", label: "470 µF cap at VM", x: 3, y: 0 },
          ],
          edges: [
            { from: "bat", to: "vm", color: "red" },
            { from: "bat", to: "u5", color: "red", wrong: true },
            { from: "bat", to: "gnd", color: "black" },
            { from: "vm", to: "cap" },
          ],
        },
        options: [
          "Battery + to driver VM",
          "Bulk capacitor at the driver's VM terminal",
          "Battery − to common ground",
          "Battery + to the Uno's 5V pin",
        ],
        answerIndex: 3,
        explanation: "The 5V pin bypasses the Uno's regulator, so up to 8.4 V would go straight into the ATmega328P. It should go to VIN/barrel jack (7–12 V) or through a 5 V regulator. Battery to VM, the bulk capacitor and the common ground are all correct.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why must the Arduino GND be connected to the motor driver GND even when they use different batteries?",
        options: [
          "So that logic signals have a shared 0 V reference",
          "To charge the logic battery from the motor battery",
          "To double the available current",
          "Because PWM only works on grounded pins",
        ],
        answerIndex: 0,
        explanation: "A voltage is always measured between two points. The driver interprets 'HIGH' relative to its own ground; without a common ground, the Arduino's 5 V has no defined meaning to the driver. Connecting grounds does not charge batteries or add current.",
        difficulty: 1,
      },
    ],
  }),
];
