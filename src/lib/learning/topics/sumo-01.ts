import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_01: Topic[] = [
  defineTopic("sumo", 1, {
    slug: "intro-sumo-robotics",
    title: "Introduction to Sumo Robotics",
    minutes: 9,
    summary: "What robot sumo is, how a match is won, and which subsystems every autonomous sumo robot needs.",
    introduction:
      "Robot sumo is a pushing contest. Two autonomous robots are placed in a circular ring called a dohyo, and each tries to push the other out without falling out itself. There are no weapons and no remote control in the classic autonomous classes. The robot that controls traction, finds its opponent first and pushes straight wins.\n\nThis path takes you from the rules and the physics of pushing all the way to sensors, search algorithms and attack strategies. This first topic gives you the big picture so every later topic has a place to fit.",
    beginner:
      "Think of two people trying to shove each other out of a circle drawn on the floor. The winner is not always the strongest person. The winner is usually the one who stays low, keeps their feet planted, and pushes in a straight line while the other person is off balance. A sumo robot works the same way.\n\nEvery sumo robot has a few jobs. It must wait for the start, then look for the opponent. It must notice when it is about to drive off the white edge of the ring and turn back. When it finds the opponent, it must drive straight at it and push with as much grip as its wheels can provide.\n\nTo do these jobs the robot needs eyes (distance sensors such as an ultrasonic sensor or a Sharp IR sensor), feet that do not slip (sticky tyres), muscles (geared DC motors driven by a motor driver), a brain (an Arduino or ESP32) and a battery. The rest of this path explains each of these parts and how they work together. Remember: in sumo, grip and good decisions beat raw speed almost every time.",
    technical: [
      {
        heading: "Subsystems of a sumo robot",
        body:
          "A competitive sumo robot can be broken into five subsystems that interact constantly:\n\n- Sensing: opponent sensors (HC-SR04 ultrasonic, Sharp GP2Y0A21YK0F IR) at the front and sides, and downward-facing IR reflectance sensors (TCRT5000 or QTR) that see the white border.\n- Control: a microcontroller (Arduino Uno/Nano or ESP32) that runs a state machine: WAIT, SEARCH, ATTACK, EDGE-ESCAPE.\n- Actuation: two (sometimes four) geared DC motors driven by an H-bridge motor driver such as TB6612FNG, DRV8833 or L298N.\n- Mechanics: a low, rigid chassis with a front wedge and high-friction tyres.\n- Power: a Li-ion or LiPo pack, a switch, and regulation for the logic.\n\nWeakness in any one subsystem loses matches. A brilliant algorithm cannot push if the tyres slip, and the strongest motors are useless if the robot drives off the edge."
      },
      {
        heading: "The physics that decides most matches",
        body:
          "The maximum horizontal force a robot can apply before its wheels slip is limited by friction:\n\nF_push(max) = μ × N\n\nwhere μ is the coefficient of friction between tyre and ring surface and N is the normal (downward) force on the driven wheels. For a 500 g mini-sumo robot, N = m × g = 0.5 kg × 9.81 m/s² ≈ 4.9 N. With an assumed μ = 0.8 the robot can push with at most about 3.9 N before its tyres slip, no matter how strong its motors are.\n\nThis is why weight limits exist and why designers try to use every gram of the allowance and keep weight over the driven wheels. It is also why a wedge that lifts the opponent is powerful: lifting reduces the opponent's N, and therefore the opponent's maximum push."
      },
      {
        heading: "Weight classes you will hear about",
        body:
          "Robot sumo is run in several size classes. Common ones include mini-sumo (10 × 10 cm footprint, 500 g, 77 cm ring) and the larger 3 kg class (20 × 20 cm footprint, 154 cm ring). Smaller micro and nano classes also exist. The physics is the same in every class; only the scale changes.\n\nYour club may use its own class definitions. The Competition Rules topic explains the typical rule categories, but the club rulebook set by your administrators always has the final word."
      }
    ],
    workingPrinciple:
      "A sumo robot runs a continuous sense-decide-act loop. After the mandatory start delay it reads its edge sensors first (safety has priority), then its opponent sensors. If an edge is detected it reverses and turns away. If the opponent is detected ahead it drives both motors forward at high power to push. If the opponent is to one side it turns toward it. If nothing is detected it executes a search pattern such as spinning or circling. The loop repeats hundreds of times per second, so the robot reacts to changes almost instantly while the friction between its tyres and the ring converts motor torque into pushing force.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Power on and wait for start signal",
          "Wait 5 seconds (start delay)",
          "Read edge sensors: edge seen? -> reverse and turn away",
          "Read opponent sensors: target ahead? -> full-power push",
          "Target to the side? -> turn toward it",
          "Nothing seen -> search pattern (spin or arc)",
          "Repeat loop"
        ]
      },
      {
        kind: "formula",
        latexish: "F_push(max) = μ · m · g",
        legend: {
          "F_push(max)": "largest pushing force before the wheels slip (N)",
          "μ": "coefficient of friction between tyre and ring (no unit)",
          m: "mass carried by the driven wheels (kg)",
          g: "gravitational acceleration, 9.81 m/s²"
        }
      }
    ],
    examples: [
      {
        title: "A minimal sumo state machine skeleton",
        body:
          "This skeleton shows the priority order every sumo program should follow: edge first, then opponent, then search. The sensor and motor functions are placeholders you will fill in during later topics.",
        code: `const int EDGE_PIN = A0;      // downward IR sensor (analog)
const int EDGE_THRESHOLD = 300; // below this = white edge (calibrate!)

int readDistanceCm() {
  return 100; // placeholder: replace with HC-SR04 code later
}

void drive(int left, int right) {
  // placeholder: replace with motor driver code later
}

void setup() {
  Serial.begin(9600);
  delay(5000); // mandatory start delay
}

void loop() {
  int edge = analogRead(EDGE_PIN);
  int dist = readDistanceCm();
  if (edge < EDGE_THRESHOLD) {
    drive(-200, -200);  // back off the edge
    delay(250);
    drive(200, -200);   // spin away
    delay(200);
  } else if (dist < 40) {
    drive(255, 255);    // attack
  } else {
    drive(150, -150);   // search by spinning
  }
}`
      },
      {
        title: "Estimating your pushing limit",
        body:
          "A 480 g robot with all of its weight on two rubber-tyred drive wheels and an assumed μ of 0.9 can push with at most 0.48 × 9.81 × 0.9 ≈ 4.2 N. If the motors could produce 6 N at the tyre, the extra 1.8 N is wasted as wheel spin. Knowing this number tells you whether to spend effort on stronger motors or on better tyres and more weight on the driven wheels."
      }
    ],
    commonMistakes: [
      {
        mistake: "Building for top speed instead of pushing force",
        why: "Sumo is decided by traction and torque. A fast robot with low torque stalls or bounces off a slower, stronger opponent.",
        fix: "Choose gear ratios that give high torque and moderate speed, and invest in tyres and weight placement."
      },
      {
        mistake: "Checking opponent sensors before edge sensors",
        why: "If the attack branch runs first, the robot can chase an opponent straight over the edge.",
        fix: "Always test edge sensors first in the loop and give the escape routine the highest priority."
      },
      {
        mistake: "Forgetting the start delay",
        why: "Moving before the start delay ends is a rule violation in most sumo competitions and can cost the round.",
        fix: "Put the start delay in code and test it with a stopwatch before every event."
      }
    ],
    keyTakeaways: [
      "Robot sumo is an autonomous pushing contest inside a circular dohyo.",
      "Every sumo robot needs sensing, control, actuation, mechanics and power working together.",
      "Maximum pushing force is limited by friction: F = μ × N, not by motor strength alone.",
      "Edge detection must have the highest priority in the control loop.",
      "Your club rulebook defines the exact class limits you must build to."
    ],
    relatedComponents: ["Arduino Uno R3", "TB6612FNG", "HC-SR04", "TCRT5000", "N20 Micro Metal Gear Motor", "LiPo 2S Battery"],
    youtubeSearch: "autonomous mini sumo robot competition explained",
    quiz: [
      {
        type: "mcq",
        prompt: "What normally limits the maximum pushing force of a sumo robot once its motors are reasonably strong?",
        options: [
          "The clock speed of the microcontroller",
          "The colour of the robot",
          "The range of the ultrasonic sensor",
          "The friction between the tyres and the ring surface"
        ],
        answerIndex: 3,
        explanation:
          "Pushing force is capped by F = μ × N. Once the motors can produce more force than that, the wheels simply spin. Microcontroller speed affects reaction time, not the force limit, so it is the tempting but wrong choice.",
        difficulty: 1
      },
      {
        type: "identify-component",
        prompt: "Which component does a sumo robot use to notice that it has reached the white border of the ring?",
        options: [
          "HC-SR04 ultrasonic sensor pointing forward",
          "The motor driver's current sense pin",
          "A limit switch on the rear bumper",
          "Downward-facing IR reflectance sensor such as a TCRT5000"
        ],
        answerIndex: 3,
        explanation:
          "A downward IR reflectance sensor measures how much infrared light bounces back. The white border reflects much more than the black ring, so the reading changes sharply. A forward-facing ultrasonic sensor looks for objects at a distance; it cannot see a painted line on the floor.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt:
          "In the skeleton program, the robot is near the white edge (edge reading 150) AND the opponent is 20 cm ahead. What does the robot do in that loop pass?",
        code: `if (edge < EDGE_THRESHOLD) {   // EDGE_THRESHOLD = 300
  drive(-200, -200); delay(250);
  drive(200, -200);  delay(200);
} else if (dist < 40) {
  drive(255, 255);
} else {
  drive(150, -150);
}`,
        options: [
          "Drives forward at full power to attack",
          "Spins on the spot to search",
          "Reverses, then spins away from the edge",
          "Stops completely"
        ],
        answerIndex: 2,
        explanation:
          "150 is below the threshold of 300, so the first branch runs and the else-if branches are skipped. The robot reverses and turns away. Many students pick 'attack' because the opponent is close, but the edge check comes first and has priority, which is exactly what keeps the robot in the ring.",
        difficulty: 2
      },
      {
        type: "identify-driver",
        prompt:
          "A club member shows a large module with a big black heat sink, screw terminals, a 5 V regulator jumper and pins labelled ENA, IN1, IN2, IN3, IN4, ENB. Which motor driver is it?",
        options: ["TB6612FNG", "DRV8833", "L298N", "A4988"],
        answerIndex: 2,
        explanation:
          "ENA/ENB enable pins, IN1–IN4, a large heat sink and an onboard 5 V regulator jumper are the signature of the L298N module. The TB6612FNG is a tiny board with AIN/BIN, PWMA/PWMB and STBY pins. The A4988 is a stepper driver, not a DC motor H-bridge.",
        difficulty: 1
      }
    ]
  }),

  defineTopic("sumo", 2, {
    slug: "sumo-competition-rules",
    title: "Competition Rules",
    minutes: 8,
    summary: "The typical rule categories of robot sumo — size, weight, autonomy, start delay, match structure and safety — and why your club rulebook comes first.",
    introduction:
      "Rules shape the design of every sumo robot. Size and weight limits decide how big your motors and battery can be; the start delay decides how your program begins; the ring dimensions decide your sensor ranges. This topic describes the rule categories that appear in most robot sumo events, using common mini-sumo values as examples.\n\nImportant: the official rulebook published by your club administrators takes precedence over anything written here. Always read it before you design, and re-read it before every competition.",
    beginner:
      "Rules in robot sumo are like the rules of a board game: they make the game fair and tell you what pieces you may use. Before you build anything you need to know the size of the box your robot must fit into, how heavy it may be, and what it is allowed to do.\n\nIn a common mini-sumo class, a robot must fit inside a 10 cm × 10 cm square and weigh no more than 500 g. Height is often unlimited. The ring, called the dohyo, is a black circle about 77 cm across with a white border painted around the edge. The robot must be fully autonomous: once the match starts, nobody may control it.\n\nWhen the referee signals the start, each team presses a button or uses a start module, and the robot must wait five seconds before moving. This gives humans time to step away. A match usually has several rounds, and the first robot to win a set number of rounds wins the match.\n\nRules also ban things that would damage the ring or the opponent, such as jammers, sticky substances that ruin the ring, or parts that fly off. Your own club's rulebook may change any of these numbers, so treat it as the final authority.",
    technical: [
      {
        heading: "Size, weight and the ring",
        body:
          "Typical mini-sumo values (used in many international events):\n\n- Footprint: must fit inside 10 cm × 10 cm at the start (inspection is usually done with a square box or gauge). Many rules allow the robot to expand after the start as long as it does not separate into pieces.\n- Mass: at most 500 g including the battery.\n- Dohyo: 77 cm diameter black circle with a white border on the outer edge (about 2.5 cm wide in common mini-sumo rules).\n- Larger classes scale up: the 3 kg class commonly uses a 20 × 20 cm footprint and a 154 cm ring.\n\nDesign implication: if your robot weighs 430 g, you are leaving 70 g of potential normal force (and therefore traction) unused. Teams often add ballast to reach the limit."
      },
      {
        heading: "Autonomy and the start sequence",
        body:
          "Autonomous classes forbid any control after the start signal. The common procedure is:\n\n- Robots are placed in the ring, often behind start lines or in positions set by the referee.\n- On the referee's signal, operators activate the robot (button press or IR start module).\n- The robot must remain still for 5 seconds before moving.\n\nIn code this is a blocking delay(5000) after the start trigger, or a millis()-based timer. Moving early is usually penalised. Note the difference between delay(5000) (5 s) and delay(500) (0.5 s) — a single missing zero can lose a round."
      },
      {
        heading: "Match structure and scoring",
        body:
          "A match is usually best-of-three rounds, each with a time limit set by the rules. A point (often called a Yuko) is awarded when the opponent touches the area outside the ring. If the time limit expires, the referee may restart the round or decide by judgement depending on the rulebook. Repositioning and restarts after a stalemate are common.\n\nBecause rounds are short and restarts are frequent, reliable start behaviour and fast opponent acquisition matter more than long-term strategy."
      },
      {
        heading: "Prohibited items and the club rulebook",
        body:
          "Typical rulebooks ban:\n\n- Devices that jam or interfere with the opponent's sensors or controls.\n- Parts that damage or contaminate the ring surface, and adhesives or suction that make the robot stick to the ring (some classes have specific rules on this).\n- Projectiles, liquids, flames, or anything that deliberately breaks the opponent.\n- Parts that detach during the match.\n\nRulebooks differ on details such as tyre cleaning, magnets and expansion after the start. The rulebook published by your club administrators takes precedence over this guide and over any international rulebook. If something is unclear, ask the organisers before you build, not on competition day."
      }
    ],
    workingPrinciple:
      "Rules work as design constraints. The size box and mass limit bound the motor, battery and chassis choices; the ring diameter bounds useful sensor range (a 77 cm ring means an opponent is never more than about 77 cm away); the start delay defines the first block of your program; and the autonomy rule means every decision must be made by your code from sensor data. Designing to the rules first prevents disqualification and focuses effort where it wins rounds.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Inspection: fits 10 × 10 cm box? mass ≤ 500 g?",
          "Robots placed in the dohyo",
          "Referee start signal -> operator starts robot",
          "Robot waits 5 seconds without moving",
          "Round runs until a robot leaves the ring or time expires",
          "Points recorded; best of three rounds wins"
        ]
      }
    ],
    examples: [
      {
        title: "Button start with an exact 5-second delay",
        body:
          "The robot waits for a button on pin 2 (wired to GND, using the internal pull-up), then waits exactly 5 seconds before entering the fight loop. The started flag ensures the delay runs only once.",
        code: `const int START_BTN = 2;
bool started = false;

void setup() {
  pinMode(START_BTN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (!started) {
    if (digitalRead(START_BTN) == LOW) {
      digitalWrite(LED_BUILTIN, HIGH); // show the countdown has begun
      delay(5000);                     // 5 second rule
      digitalWrite(LED_BUILTIN, LOW);
      started = true;
    }
    return; // do nothing until started
  }
  // fight code goes here
}`
      },
      {
        title: "Using the mass allowance",
        body:
          "A team's robot weighs 452 g. The limit is 500 g, so they add 40 g of steel ballast low and over the drive wheels, leaving an 8 g margin for scale differences. Normal force on the wheels rises from about 4.43 N to about 4.83 N, a 9 percent increase in maximum push for zero extra electrical complexity."
      }
    ],
    commonMistakes: [
      {
        mistake: "Designing exactly to 500 g with no margin",
        why: "Different scales disagree by a few grams, and a robot that is 501 g on the official scale fails inspection.",
        fix: "Aim for a few grams under the limit and carry removable ballast so you can adjust on the day."
      },
      {
        mistake: "Measuring the footprint without wires and tyres",
        why: "Protruding wires, switch levers or tyre bulges can push the robot outside the 10 × 10 cm box.",
        fix: "Build a test box from card with the exact inner dimensions and check the finished robot in it."
      },
      {
        mistake: "Assuming international rules apply unchanged",
        why: "Clubs often adapt rules (ring size, round time, allowed parts). The club rulebook takes precedence.",
        fix: "Read the club rulebook set by the administrators and ask organisers about anything unclear."
      }
    ],
    keyTakeaways: [
      "Common mini-sumo limits: 10 × 10 cm footprint, 500 g, 77 cm dohyo with a white border.",
      "Robots must be fully autonomous and wait 5 seconds after the start signal.",
      "Matches are usually best of three rounds; leaving the ring loses the point.",
      "Jamming, ring-damaging parts and detaching parts are typically banned.",
      "Your club's official rulebook takes precedence over any general guide."
    ],
    relatedComponents: ["Arduino Uno R3", "Arduino Nano", "Push Button Switch", "LiPo 2S Battery"],
    youtubeSearch: "mini sumo robot rules 10x10 cm 500 g dohyo",
    quiz: [
      {
        type: "mcq",
        prompt: "In common mini-sumo rules, what must a robot do immediately after the start signal?",
        options: [
          "Charge forward at full speed",
          "Spin once to calibrate its sensors",
          "Wait for the referee to press its button",
          "Remain still for 5 seconds before moving"
        ],
        answerIndex: 3,
        explanation:
          "Common sumo rules require a 5-second wait after the start signal so operators can step away safely. Charging immediately is the tempting answer for an aggressive strategy, but it breaks the rule and can lose the round. Always confirm the exact procedure in your club rulebook.",
        difficulty: 1
      },
      {
        type: "calculate",
        prompt:
          "A mini-sumo robot weighs 455 g. The class limit is 500 g and the team wants to keep a 5 g safety margin. How much ballast can they add?",
        options: [
          "45 g",
          "35 g",
          "50 g",
          "40 g"
        ],
        answerIndex: 3,
        explanation:
          "500 g − 5 g margin = 495 g target. 495 − 455 = 40 g of ballast. 45 g would use the whole allowance with no margin, which risks failing on a slightly different scale.",
        difficulty: 1
      },
      {
        type: "debug-code",
        prompt:
          "At the competition this robot is penalised for moving too early after the start button is pressed. Which line is the bug?",
        code: `const int START_BTN = 2;

void attack() {
  // motor code
}

void setup() {
  pinMode(START_BTN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(START_BTN) == LOW) {
    delay(500);
    attack();
  }
}`,
        options: [
          "pinMode(START_BTN, INPUT_PULLUP); should use INPUT",
          "digitalRead(START_BTN) == LOW should be == HIGH",
          "delay(500); waits only 0.5 s and should be delay(5000);",
          "attack(); must be called in setup()"
        ],
        answerIndex: 2,
        explanation:
          "delay() takes milliseconds, so delay(500) is half a second. The rule requires 5 seconds, which is delay(5000). The INPUT_PULLUP and LOW check are correct for a button wired to ground: the pin reads LOW when the button is pressed.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt:
          "Using the button-start example with the 'started' flag, the operator presses the button, the 5 seconds pass, and then the operator presses the button again during the fight. What happens?",
        options: [
          "The robot stops and waits another 5 seconds",
          "Nothing changes; the fight code keeps running",
          "The Arduino resets",
          "The robot reverses direction"
        ],
        answerIndex: 1,
        explanation:
          "Once started is true, the if (!started) block is skipped entirely, so the button is never read again. A common wrong belief is that pressing the button restarts the countdown, but that would only happen if the code checked the button every loop.",
        difficulty: 2
      }
    ]
  }),

  defineTopic("sumo", 3, {
    slug: "sumo-robot-design",
    title: "Sumo Robot Design",
    minutes: 10,
    summary: "How to turn the rules and the physics of pushing into a balanced design: layout, motors, sensors, power and mass budget.",
    introduction:
      "A good sumo robot is a set of deliberate trade-offs. You have a fixed footprint and mass, and you must divide them between motors, battery, electronics, sensors, chassis and ballast. This topic walks through a design process that starts from the rules and ends with a wiring and mass plan you can actually build.",
    beginner:
      "Designing a sumo robot is like packing a small suitcase with a strict weight limit for an important trip. Everything you put in must earn its place. Heavy motors give strength but use up weight; a big battery lasts longer but takes space; extra sensors help you see but add wires and grams.\n\nThe winning idea in sumo is simple: be low, be heavy over your driven wheels, grip the floor, and push straight. So the club's standard design is 4WD: four small N20 geared motors so every wheel pushes, a sloped wedge at the front to scoop under the opponent, the battery low down, and distance sensors facing forward and to the sides. Downward IR sensors at the front corners watch for the white edge.\n\nBefore buying parts, write a mass budget: a list of every part and its weight. Add it up and compare with the limit. Then sketch the layout from the top and the side to check the 10 × 10 cm box. Only then start building. Planning first saves you from discovering on competition day that the robot is too heavy, too tall at the back, or that the battery will not fit.",
    technical: [
      {
        heading: "Design requirements from the rules and physics",
        body:
          "Derive measurable requirements:\n\n- Footprint ≤ 10 × 10 cm, mass ≤ 500 g (mini-sumo; check your club rulebook).\n- Maximum push F = μ × N ⇒ maximise mass on driven wheels and tyre μ.\n- Wheel force from torque: F_wheel = τ_wheel / r. For four motors (the club's 4WD layout) each giving 0.05 N·m at the wheel with r = 0.02 m, total force = 4 × 0.05 / 0.02 = 10 N, well above a traction limit of about 4 N, so the motors are sufficient and traction is the limit.\n- Reaction time: a sensor-to-motor loop under about 10–20 ms keeps the robot responsive at typical sumo speeds."
      },
      {
        heading: "Mass budget example",
        body:
          "A realistic 4WD mini-sumo mass budget (example values; weigh your own parts):\n\n- 4 × N20 metal gear motors with brackets: 60 g\n- Four wheels and tyres: 60 g\n- Arduino Nano and wiring: 15 g\n- TB6612FNG driver (left pair on channel A, right pair on channel B): 3 g\n- 2S LiPo battery: 30–50 g\n- Sensors (2 × distance, 2 × edge): 20 g\n- Chassis and wedge: 120 g\n- Total ≈ 330 g ⇒ about 170 g available for ballast.\n\nWith 4WD every wheel is driven, so ballast placed low between the axles directly increases N on driven wheels and therefore the traction-limited push. Steel or tungsten blocks are common."
      },
      {
        heading: "Electrical architecture",
        body:
          "A standard wiring plan:\n\n- Battery + → power switch → motor driver motor supply (VM) and, through a regulator or the board's Vin, the microcontroller.\n- All grounds connected together (battery −, driver GND, Arduino GND, sensor GND). Without a common ground, logic signals have no reference.\n- Driver logic inputs (AIN1/AIN2/PWMA etc.) to Arduino digital and PWM pins (on Uno/Nano PWM pins are 3, 5, 6, 9, 10, 11).\n- Sensors powered from the regulated 5 V rail, never directly from the battery.\n- Never connect a battery above 5 V to the Arduino 5V pin; that pin bypasses the regulator."
      }
    ],
    workingPrinciple:
      "The design process is iterative: requirements from rules and physics drive component selection; component masses and sizes are checked against the budget and footprint; the layout places mass low and over the driven wheels and puts sensors where they see the opponent and the edge; and the electrical plan ensures clean power and a common ground. Testing then feeds back into the design.",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "2S LiPo 7.4 V", x: 40, y: 60 },
          { id: "sw", label: "Power switch", x: 160, y: 60 },
          { id: "drv", label: "TB6612FNG", x: 300, y: 60 },
          { id: "uno", label: "Arduino Nano", x: 300, y: 200 },
          { id: "m", label: "4 × N20 motors", x: 460, y: 60 },
          { id: "sens", label: "HC-SR04 + edge sensors", x: 460, y: 200 }
        ],
        edges: [
          { from: "bat", to: "sw", label: "+", color: "red" },
          { from: "sw", to: "drv", label: "VM", color: "red" },
          { from: "sw", to: "uno", label: "Vin", color: "red" },
          { from: "uno", to: "drv", label: "AIN/BIN/PWM/STBY" },
          { from: "drv", to: "m", label: "AO left pair / BO right pair" },
          { from: "uno", to: "sens", label: "5V, GND, signals" },
          { from: "bat", to: "uno", label: "common GND", color: "black" }
        ]
      },
      {
        kind: "formula",
        latexish: "F_wheel = τ_wheel / r",
        legend: { F_wheel: "force at the tyre contact (N)", "τ_wheel": "torque at the wheel axle (N·m)", r: "wheel radius (m)" }
      }
    ],
    examples: [
      {
        title: "Checking motors against the traction limit",
        body:
          "Robot mass 495 g, μ assumed 0.9, all weight on the four driven wheels of a 4WD robot: traction limit = 0.495 × 9.81 × 0.9 ≈ 4.37 N. Wheels are 30 mm diameter (r = 0.015 m). Required wheel torque in total to reach the traction limit = 4.37 × 0.015 ≈ 0.066 N·m, or about 0.017 N·m per motor across four motors. Any motor that can deliver comfortably more than this at the wheel without stalling is strong enough; extra torque beyond this only spins the tyres."
      },
      {
        title: "Pin plan for an Arduino Nano sumo",
        body:
          "A clean pin plan avoids conflicts: PWM pins for motor speed, plain digital pins for direction, analog pins for edge sensors. On the 4WD robot, channel A drives the left motor pair (wired in parallel) and channel B the right pair.",
        code: `// Motor driver (TB6612FNG)
const int PWMA = 5;   // left speed (PWM)
const int AIN1 = 7;
const int AIN2 = 8;
const int PWMB = 6;   // right speed (PWM)
const int BIN1 = 4;
const int BIN2 = 2;
const int STBY = 3;
// Sensors
const int TRIG = 9;
const int ECHO = 10;
const int EDGE_L = A0;
const int EDGE_R = A1;

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY, TRIG};
  for (int i = 0; i < 8; i++) pinMode(outs[i], OUTPUT);
  pinMode(ECHO, INPUT);
  digitalWrite(STBY, HIGH); // enable driver
  Serial.begin(9600);
}

void loop() {
  Serial.print(analogRead(EDGE_L));
  Serial.print(" ");
  Serial.println(analogRead(EDGE_R));
  delay(100);
}`
      }
    ],
    commonMistakes: [
      {
        mistake: "Choosing motors before writing a mass budget",
        why: "Heavy motors can consume the weight that should go into ballast over the wheels, reducing traction.",
        fix: "Write the mass budget first and choose motors that are strong enough for the traction limit, not stronger."
      },
      {
        mistake: "Placing the battery high on top of the robot",
        why: "A high centre of gravity makes the robot easier to tip and lift with a wedge.",
        fix: "Mount the battery as low as possible, between or just ahead of the drive wheels."
      },
      {
        mistake: "Powering the Arduino 5V pin straight from a 2S LiPo",
        why: "The 5V pin bypasses the regulator; 7.4–8.4 V on it can destroy the board.",
        fix: "Feed the battery to Vin (or the barrel jack) or use a separate 5 V regulator."
      }
    ],
    keyTakeaways: [
      "Start with requirements from the rules and from F = μ × N.",
      "Write a mass budget and use leftover mass as low ballast over the driven wheels.",
      "Check motor torque against the traction limit using F = τ / r.",
      "Plan pins before wiring: PWM pins for speed, analog pins for edge sensors.",
      "Common ground is mandatory; never put battery voltage on the 5V pin."
    ],
    relatedComponents: ["Arduino Nano", "TB6612FNG", "N20 Micro Metal Gear Motor", "HC-SR04", "TCRT5000", "LiPo 2S Battery"],
    youtubeSearch: "how to design a mini sumo robot chassis motors sensors",
    quiz: [
      {
        type: "identify-component",
        prompt:
          "A sensor module has two round silver 'eyes', four pins labelled VCC, Trig, Echo, GND, and measures distance using 40 kHz sound pulses. What is it?",
        options: ["Sharp GP2Y0A21YK0F", "TCRT5000", "HC-SR04", "QTR-8A"],
        answerIndex: 2,
        explanation:
          "The HC-SR04 ultrasonic sensor has a transmitter and receiver 'eye' and the Trig/Echo pins. The Sharp GP2Y0A21YK0F also measures distance but uses infrared light and gives an analog voltage output with three wires, not Trig/Echo.",
        difficulty: 1
      },
      {
        type: "calculate",
        prompt:
          "Each of two motors delivers 0.06 N·m at the wheel. Wheel radius is 0.02 m. What total forward force can the motors produce at the tyres (ignoring slip)?",
        options: ["3 N", "6 N", "1.2 N", "0.0024 N"],
        answerIndex: 1,
        explanation:
          "F = τ / r per wheel = 0.06 / 0.02 = 3 N. Two wheels give 6 N total. Choosing 3 N forgets the second motor; 0.0024 N comes from multiplying τ × r instead of dividing.",
        difficulty: 2
      },
      {
        type: "find-wrong-connection",
        prompt:
          "Which connection in this sumo robot wiring list is WRONG?\n\nA) Battery − → TB6612FNG GND\nB) TB6612FNG GND → Arduino GND\nC) 2S LiPo + (7.4 V) → Arduino 5V pin\nD) Arduino D5 → TB6612FNG PWMA",
        options: ["A", "B", "C", "D"],
        answerIndex: 2,
        explanation:
          "The 5V pin is the regulated rail; feeding 7.4–8.4 V into it bypasses the regulator and can destroy the Arduino and anything else on that rail. It should go to Vin. A and B form the required common ground, and D5 is a valid PWM pin for PWMA.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Your mass budget totals 310 g for a 500 g class. What is the most effective use of the spare mass for pushing power?",
        options: [
          "A larger chassis top plate for looks",
          "Low ballast placed over the driven wheels",
          "A second Arduino as a backup",
          "Taller sensor masts"
        ],
        answerIndex: 1,
        explanation:
          "Ballast low and over the driven wheels increases the normal force N on those wheels, raising the traction limit μN and lowering the centre of gravity. Extra mass high up (masts, top plates) raises the centre of gravity and does not add much useful traction.",
        difficulty: 1
      }
    ]
  })
];
