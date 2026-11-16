import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_07: Topic[] = [
  defineTopic("sumo", 7, {
    slug: "sumo-motor-torque",
    title: "Motor Torque",
    minutes: 11,
    summary: "How DC gear motors produce torque, how the torque-speed curve and gear ratio shape pushing force, and how to size motors for sumo.",
    introduction:
      "Torque is the twisting effort a motor applies to its shaft. In sumo, torque at the wheel becomes pushing force at the tyre, so understanding torque lets you choose motors and gear ratios that can reach the traction limit without stalling or burning out. This topic covers the DC motor torque-speed curve, stall current, gearing and the conversion from torque to force.",
    beginner:
      "Think about opening a heavy door. Pushing near the handle (far from the hinges) is easy; pushing near the hinges is very hard. The twisting effect of your push is called torque: force multiplied by the distance from the pivot.\n\nA motor produces torque on its shaft. A small DC motor on its own spins very fast but with little torque — like a bicycle in its highest gear, great on flat ground but useless up a steep hill. A gearbox trades speed for torque: the output turns slower but twists much harder. That is why sumo robots use geared motors such as N20 or BO motors.\n\nThe wheel then turns torque back into a straight-line push. A small wheel gives more push for the same torque, while a large wheel gives more speed but less push. When the robot is shoving an opponent and barely moving, the motor works near its 'stall' point: maximum torque, but also maximum current and heat. Good sumo design picks a gear ratio and wheel size that give enough push to reach the tyre grip limit while keeping the motor out of long, damaging stalls.",
    technical: [
      {
        heading: "The DC motor torque-speed line",
        body:
          "For a brushed DC motor at a fixed voltage, torque falls approximately linearly with speed:\n\nτ = τ_stall × (1 − ω / ω_free)\n\n- At ω = 0 (stalled) torque is maximum, τ_stall.\n- At ω = ω_free (no load) torque is zero.\n- Mechanical power P = τ × ω is maximum at half the free speed, where τ = τ_stall / 2.\n\nTorque is proportional to current: τ = k_t × I. So stall torque comes with stall current, I_stall ≈ V / R_winding. Example: a motor with 4 Ω winding resistance at 6 V has I_stall ≈ 1.5 A. Your driver and battery must be able to supply this current during a push."
      },
      {
        heading: "Gearing and wheel radius",
        body:
          "A gearbox with ratio G (input turns per output turn) and efficiency η gives:\n\nτ_out = τ_motor × G × η,  ω_out = ω_motor / G\n\nThe wheel turns torque into force: F = τ_wheel / r.\n\nWorked example: motor stall torque 0.002 N·m, G = 150, η = 0.6 ⇒ τ_wheel = 0.002 × 150 × 0.6 = 0.18 N·m. With r = 0.015 m, F_stall = 0.18 / 0.015 = 12 N per wheel. Two wheels: 24 N — far above a 500 g robot's traction limit of roughly 4–5 N. The robot will spin its tyres long before stalling, which is what you want: torque is not the limit, grip is."
      },
      {
        heading: "Units and numeric pitfalls",
        body:
          "Datasheets often state torque in kg·cm (more correctly kgf·cm). Convert with 1 kgf·cm ≈ 0.0981 N·m. A motor rated '2 kg·cm' therefore gives about 0.196 N·m.\n\nOn an Arduino Uno an int is 16-bit (−32768 to 32767). Multiplying a torque in g·cm by a gear ratio, such as 250 × 150 = 37500, overflows an int. Use long (32-bit) for such calculations: long t = 250L * 150;"
      }
    ],
    workingPrinciple:
      "Current flowing through the motor's armature windings in a magnetic field produces a torque proportional to current. As the motor speeds up it generates a back-EMF that opposes the supply voltage, reducing current and therefore torque, which produces the falling torque-speed line. The gearbox multiplies torque (minus friction losses) and the wheel radius converts that torque into a linear force at the tyre contact.",
    diagrams: [
      {
        kind: "signal",
        title: "Brushed DC motor torque and power vs speed (normalised)",
        series: [
          { label: "Torque (fraction of stall)", points: [[0, 1], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [1, 0]] },
          { label: "Power (fraction of max)", points: [[0, 0], [0.25, 0.75], [0.5, 1], [0.75, 0.75], [1, 0]] }
        ],
        xLabel: "Speed (fraction of free speed)",
        yLabel: "Fraction"
      },
      {
        kind: "formula",
        latexish: "F = (τ_motor · G · η) / r",
        legend: { F: "force at the tyre (N)", "τ_motor": "motor shaft torque (N·m)", G: "gear ratio", "η": "gearbox efficiency (0–1)", r: "wheel radius (m)" }
      }
    ],
    examples: [
      {
        title: "Is this motor strong enough?",
        body:
          "Target: reach a traction limit of 4.4 N with two driven wheels of radius 0.02 m. Required torque per wheel = (4.4 / 2) × 0.02 = 0.044 N·m. A gear motor rated 1 kgf·cm (≈ 0.098 N·m) at stall has more than double this, so it can break traction while still turning, rather than stalling."
      },
      {
        title: "Torque calculation without overflow",
        body:
          "Use long when products can exceed 32767 on an Uno.",
        code: `void setup() {
  Serial.begin(9600);
  long motorTorque_gcm = 250;   // example motor torque in g·cm
  long ratio = 150;
  long wheelTorque_gcm = motorTorque_gcm * ratio * 6 / 10; // 60% efficiency
  Serial.print("Wheel torque g.cm: ");
  Serial.println(wheelTorque_gcm); // 22500
}

void loop() {}`
      }
    ],
    commonMistakes: [
      {
        mistake: "Choosing the highest-RPM motor for sumo",
        why: "High free speed usually means low torque at the wheel; the robot stalls or bounces off a geared-down opponent.",
        fix: "Choose a gear ratio that gives enough wheel torque to reach the traction limit at moderate speed."
      },
      {
        mistake: "Ignoring stall current when choosing a driver",
        why: "In a pushing match motors operate near stall, drawing their highest current; an undersized driver overheats or shuts down.",
        fix: "Estimate I_stall ≈ V / R_winding (or read the datasheet) and pick a driver rated for it."
      },
      {
        mistake: "Multiplying large values in int on an Uno",
        why: "int is 16-bit; 250 × 150 = 37500 overflows to a negative number.",
        fix: "Use long and the L suffix (250L * 150) for products that may exceed 32767."
      }
    ],
    keyTakeaways: [
      "Torque falls linearly with speed; maximum torque and current occur at stall.",
      "Gearboxes multiply torque by G × η and divide speed by G.",
      "Force at the tyre is F = τ_wheel / r; smaller wheels push harder.",
      "If motor force exceeds μN the tyres slip, so traction is often the true limit.",
      "Size the motor driver for stall current, not running current."
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "BO Gear Motor", "TB6612FNG", "DRV8833", "L298N"],
    youtubeSearch: "DC motor torque speed curve stall current explained",
    quiz: [
      {
        type: "calculate",
        prompt: "A gear motor delivers 0.15 N·m at the wheel. The wheel radius is 0.025 m. What force does this wheel apply at the tyre?",
        options: ["0.00375 N", "3.75 N", "6 N", "60 N"],
        answerIndex: 2,
        explanation:
          "F = τ / r = 0.15 / 0.025 = 6 N. 0.00375 N comes from multiplying τ × r instead of dividing, and 60 N is a decimal-place slip.",
        difficulty: 2
      },
      {
        type: "identify-driver",
        prompt:
          "You need a small, efficient MOSFET dual H-bridge for two motors on a 12 V supply drawing about 1 A each continuously. Which driver fits?",
        options: [
          "DRV8833 (2.7–10.8 V motor supply)",
          "A single NPN transistor",
          "L293D (about 0.6 A per channel)",
          "TB6612FNG (motor supply up to 15 V, about 1.2 A continuous per channel)"
        ],
        answerIndex: 3,
        explanation:
          "The TB6612FNG accepts up to 15 V on VM and is rated about 1.2 A continuous (3.2 A peak) per channel with low MOSFET losses. The DRV8833 is also efficient but its motor supply maximum is 10.8 V, below 12 V. The L293D's current rating is too low, and one transistor cannot reverse a motor.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int motorTorque = 250; // g.cm
  int ratio = 150;
  int wheelTorque = motorTorque * ratio;
  Serial.println(wheelTorque);
}

void loop() {}`,
        options: ["37500", "-28036", "32767", "0"],
        answerIndex: 1,
        explanation:
          "On the Uno an int is 16-bit (−32768 to 32767). 250 × 150 = 37500 does not fit; in practice the AVR result wraps around to 37500 − 65536 = −28036. 37500 is the mathematically correct value you would get with long, and the value does not clamp to 32767.",
        difficulty: 3
      },
      {
        type: "mcq",
        prompt: "If you replace a 50:1 gearbox with a 100:1 gearbox on the same motor (same efficiency), what happens ideally?",
        options: [
          "Wheel torque doubles and wheel speed halves",
          "Wheel torque and speed both double",
          "Wheel torque halves and wheel speed doubles",
          "Nothing changes because the motor is the same"
        ],
        answerIndex: 0,
        explanation:
          "τ_out = τ_motor × G × η and ω_out = ω_motor / G. Doubling G doubles torque and halves speed. Gearing cannot increase both, because power (τ × ω) is conserved apart from losses.",
        difficulty: 1
      }
    ]
  }),

  defineTopic("sumo", 8, {
    slug: "sumo-wheel-grip",
    title: "Wheel Grip",
    minutes: 9,
    summary: "Friction between tyre and ring, static versus kinetic friction, tyre materials and how to keep grip high during a match.",
    introduction:
      "Every newton of pushing force must pass through the small contact patch between tyre and ring. The coefficient of friction μ of that contact sets the traction limit, so improving grip is often the cheapest way to win more pushes. This topic explains friction, tyre materials and practical grip management.",
    beginner:
      "Try pushing a heavy box across the floor while wearing socks, and then while wearing rubber-soled shoes. With socks your feet slide and you cannot push hard. With shoes you can lean in and push with your full strength. The shoes did not make you stronger — they let you use the strength you already had.\n\nTyres do the same job for a sumo robot. The ring surface is usually smooth, so hard plastic wheels slide easily. Soft rubber, silicone or polyurethane tyres grip much better. The grip depends on the tyre material, on how clean the tyre is, and on how hard the robot presses down.\n\nThere is a second important idea: once a tyre starts spinning and sliding, it grips less than when it was rolling without slipping. This is the difference between static friction (not sliding) and kinetic friction (sliding). So a robot that spins its wheels in a shoving match actually pushes weaker. Smart robots apply power so the wheels stay just below the slipping point. Keeping tyres clean and dust-free between rounds also restores lost grip.",
    technical: [
      {
        heading: "Coulomb friction model",
        body:
          "The friction force available before sliding is bounded by:\n\nF_friction ≤ μ_s × N (static, no sliding)\nF_friction = μ_k × N (kinetic, while sliding)\n\nFor most material pairs μ_k < μ_s. A tyre that is rolling without slipping uses static friction at the contact patch. Once it spins, the force drops to the kinetic value, so wheel spin reduces pushing force.\n\nRequired μ for a task: μ_required = F / N. To push with 3 N while 0.4 kg rests on the driven wheels, μ_required = 3 / (0.4 × 9.81) ≈ 0.76."
      },
      {
        heading: "Tyre materials and contact",
        body:
          "- Hard plastic (e.g. standard TT motor wheels): low grip on smooth surfaces.\n- Natural or synthetic rubber O-rings and tyres: good general grip.\n- Soft cast silicone or polyurethane: very high grip on smooth surfaces; popular in sumo; collects dust easily.\n- Foam: light but compresses and wears quickly.\n\nIn the simple Coulomb model friction does not depend on contact area. Real soft tyres deviate from this somewhat, and wider soft tyres also wear more slowly and conform better to small surface irregularities, which is why sumo tyres are often wide and flat rather than thin and rounded."
      },
      {
        heading: "Managing grip in practice",
        body:
          "- Dust, hair and debris on soft tyres drastically reduce μ. Many teams clean tyres between rounds (for example with adhesive tape). Check your club rulebook for what cleaning is allowed.\n- Avoid full-power starts from rest: a sudden torque step can break traction. A short PWM ramp keeps the tyre near the static limit.\n- Keep tyres concentric and firmly fixed on the hub; a wobbly tyre loses contact pressure periodically."
      }
    ],
    workingPrinciple:
      "Friction arises from microscopic interactions between the tyre and ring surfaces. Up to the static limit μ_s·N the contact patch does not slide and the wheel can transmit any force up to that limit; beyond it the surfaces slide and the transmissible force drops to μ_k·N. Grip management therefore means maximising μ (material and cleanliness), maximising N (weight on driven wheels), and controlling torque so the contact stays below the slip point.",
    diagrams: [
      {
        kind: "signal",
        title: "Friction force vs applied drive force (illustrative)",
        series: [
          { label: "Friction force", points: [[0, 0], [1, 1], [2, 2], [3, 3], [3.5, 3.5], [3.6, 2.8], [4, 2.8], [5, 2.8]] }
        ],
        xLabel: "Drive force demanded (N)",
        yLabel: "Force transmitted (N)"
      },
      {
        kind: "formula",
        latexish: "μ_required = F / N",
        legend: { "μ_required": "minimum friction coefficient needed", F: "pushing force wanted (N)", N: "normal force on driven wheels (N)" }
      }
    ],
    examples: [
      {
        title: "Measuring μ with a tilting board",
        body:
          "Place the robot (motors off, wheels locked by the gearbox) on a board covered with the ring surface material. Slowly tilt the board until the robot starts to slide. At that angle θ, μ_s = tan θ. If sliding starts at 40°, μ_s ≈ tan 40° ≈ 0.84. Repeat with clean and dusty tyres to see how much dust costs you."
      },
      {
        title: "Soft-start to protect grip",
        body:
          "Instead of jumping to full PWM, ramp up over about 100 ms so the tyres do not break loose.",
        code: `const int PWMA = 5;
const int PWMB = 6;

void rampTo(int target) {
  for (int p = 0; p <= target; p += 25) {
    analogWrite(PWMA, p);
    analogWrite(PWMB, p);
    delay(10);
  }
  analogWrite(PWMA, target);
  analogWrite(PWMB, target);
}

void setup() {
  pinMode(PWMA, OUTPUT);
  pinMode(PWMB, OUTPUT);
  delay(5000);
  rampTo(255);
}

void loop() {}`
      }
    ],
    commonMistakes: [
      {
        mistake: "Using hard plastic wheels on a smooth ring",
        why: "Low μ means a low traction limit; the robot slides backwards under pressure.",
        fix: "Use soft rubber, silicone or polyurethane tyres."
      },
      {
        mistake: "Never cleaning the tyres",
        why: "Soft tyres pick up dust that acts like a lubricant, cutting grip round by round.",
        fix: "Clean tyres before every round with a method allowed by your rulebook."
      },
      {
        mistake: "Applying full power instantly and letting the wheels spin",
        why: "Spinning switches the contact from static to kinetic friction, which is lower.",
        fix: "Ramp PWM up and avoid sustained wheel spin."
      }
    ],
    keyTakeaways: [
      "Pushing force is limited by μ × N at the driven wheels.",
      "Static friction (rolling without slip) is higher than kinetic friction (spinning).",
      "Soft silicone or polyurethane tyres grip smooth rings best but collect dust.",
      "Measure μ with a tilting board: μ = tan θ at the slip angle.",
      "Clean tyres and ramp up PWM to keep grip high."
    ],
    relatedComponents: ["Sumo Robot Wheels", "N20 Micro Metal Gear Motor", "TB6612FNG"],
    youtubeSearch: "sumo robot tyres silicone grip cleaning",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A robot has 0.4 kg on its driven wheels and needs to push with 3 N. What is the minimum coefficient of friction required? (g = 9.81 m/s²)",
        options: ["0.30", "0.76", "1.31", "7.5"],
        answerIndex: 1,
        explanation:
          "N = 0.4 × 9.81 ≈ 3.92 N. μ = F / N = 3 / 3.92 ≈ 0.76. 1.31 is N / F (inverted), and 7.5 divides 3 by 0.4 without converting mass to weight.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Why does a sumo robot push less hard once its wheels start spinning?",
        options: [
          "Kinetic friction is usually lower than static friction",
          "The motor produces no torque while spinning",
          "The battery disconnects",
          "The robot becomes lighter"
        ],
        answerIndex: 0,
        explanation:
          "A spinning tyre slides on the ring, so the transmitted force falls from the static limit μ_s·N to the lower kinetic value μ_k·N. The motor still produces torque, but the contact cannot transmit it.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt:
          "During a head-on push, the robot's LEFT tyre is covered in dust and the RIGHT tyre is clean. Both motors get full PWM. Which way does the robot tend to turn?",
        options: [
          "It turns right",
          "It turns left",
          "It drives perfectly straight",
          "It reverses"
        ],
        answerIndex: 1,
        explanation:
          "The clean right tyre transmits more force than the slipping left tyre, so the right side pushes forward harder and the robot yaws toward the weaker (left) side. Students often guess 'right' by thinking the clean side 'pulls' the robot toward itself, but the stronger side actually swings around the weaker one.",
        difficulty: 3
      },
      {
        type: "identify-component",
        prompt: "Which wheel type is generally the best choice for maximum grip on a smooth, painted sumo ring?",
        options: [
          "Hard injection-moulded plastic wheel",
          "Omni wheel with free rollers",
          "Soft cast silicone or polyurethane tyre",
          "Steel caster ball"
        ],
        answerIndex: 2,
        explanation:
          "Soft cast silicone or polyurethane tyres have a high coefficient of friction on smooth surfaces. Omni wheels deliberately slide sideways, hard plastic has low μ, and a caster ball is unpowered and only supports weight.",
        difficulty: 1
      }
    ]
  }),

  defineTopic("sumo", 9, {
    slug: "sumo-traction",
    title: "Traction",
    minutes: 10,
    summary: "Using friction effectively: traction limits, acceleration, 2WD versus 4WD, wheel slip, soft-start ramps and the electrical side of a stalled push.",
    introduction:
      "Traction is the usable driving force your robot can apply to the ground. It brings together weight distribution, tyre grip, motor torque and control software. This topic connects those ideas, shows the maximum acceleration traction allows, and covers what happens electrically when traction holds and the motors are forced toward stall.",
    beginner:
      "Imagine a tug-of-war on a muddy field. The team with the strongest arms does not always win; the team whose feet do not slip usually does. Traction is the 'feet not slipping' part of a sumo robot.\n\nThree things decide traction: how much weight presses on the driven wheels, how sticky the tyres are, and how cleverly the power is applied. More weight on driven wheels means more traction. Four-wheel drive uses every wheel that carries weight, so it often has more usable traction than two-wheel drive with an unpowered skid.\n\nTraction also limits how fast you can speed up. Even a super-powerful robot cannot accelerate faster than its tyres allow; extra power just spins the wheels. Software can help by ramping the power up smoothly instead of slamming it on.\n\nWhen traction is good and the opponent is heavy, the wheels barely turn and the motors work close to stall. They draw a lot of current, the battery voltage drops, and if the Arduino shares that battery it may even reset. Good traction design includes good power design.",
    technical: [
      {
        heading: "Traction limit and maximum acceleration",
        body:
          "Traction force: F_t ≤ μ × N_driven. Newton's second law gives the acceleration limit for the robot alone:\n\na_max = F_t / m = μ × N_driven / m\n\nIf all the weight is on driven wheels (N_driven = m·g): a_max = μ × g. With μ = 0.8, a_max ≈ 0.8 × 9.81 ≈ 7.8 m/s². With only 70 percent of the weight on driven wheels, a_max ≈ 5.5 m/s².\n\nWhen pushing an opponent of mass m₂ that resists with its own traction, your net force is F_t(you) − F_t(opponent). This is why reducing the opponent's N with a wedge is so effective."
      },
      {
        heading: "2WD, 4WD and slip",
        body:
          "- 2WD with a skid or wedge: some weight rests on undriven contacts, reducing N_driven.\n- 4WD: all contact points that carry weight are driven, so N_driven ≈ m·g. Costs mass and space for extra motors or a transmission.\n\nSlip ratio s = (ω·r − v) / (ω·r), where ω·r is the tyre surface speed and v the actual robot speed. Peak traction usually occurs at small slip; heavy slip (wheels spinning, robot stationary, s → 1) gives lower, kinetic-friction levels."
      },
      {
        heading: "Electrical consequences of a traction-limited push",
        body:
          "Near stall, motor current approaches I_stall = V / R_winding. Two motors near stall can draw several amperes from a small pack. Battery terminal voltage sags: V_terminal = E − I × R_internal. Example values: E = 7.6 V, R_internal = 0.15 Ω, I = 4 A ⇒ V ≈ 7.0 V.\n\nIf the microcontroller is powered from the same battery through a regulator and the voltage dips too low (worn cells, high resistance wiring, or a weak switch), the board can brown out and reset. After a reset the program restarts in setup(), often including the 5-second start delay — a disaster mid-match. Mitigations: good battery, short thick motor wires, a bulk capacitor at the driver, and sometimes a separate logic supply."
      }
    ],
    workingPrinciple:
      "Traction results from the friction force at the driven contact patches, bounded by μ × N_driven. The control system sets motor torque; if torque at the tyre exceeds that bound, the tyre slips and the transmitted force drops. Optimising traction means maximising N_driven and μ, keeping slip small through torque ramps, and ensuring the power system can deliver the high near-stall current without collapsing the voltage.",
    diagrams: [
      {
        kind: "formula",
        latexish: "a_max = μ · N_driven / m",
        legend: { a_max: "maximum acceleration (m/s²)", "μ": "tyre friction coefficient", N_driven: "normal force on driven wheels (N)", m: "robot mass (kg)" }
      },
      {
        kind: "flow",
        steps: [
          "Opponent detected ahead",
          "Ramp PWM up over ~100 ms",
          "Contact: wheels slow, current rises toward stall",
          "Battery voltage sags (V = E − I·R_int)",
          "If tyres slip: reduce PWM slightly to regain grip",
          "Keep pushing straight until opponent leaves the ring"
        ]
      }
    ],
    examples: [
      {
        title: "Soft-start ramp in steps",
        body:
          "This ramp increases speed in steps of 45 until it reaches at least 200, then reports how many steps were needed.",
        code: `void setup() {
  Serial.begin(9600);
  int speed = 0;
  int steps = 0;
  while (speed < 200) {
    speed += 45;
    steps++;
  }
  Serial.print(steps);
  Serial.print(" ");
  Serial.println(speed);
}

void loop() {}`
      },
      {
        title: "Why 4WD can out-push 2WD of the same mass",
        body:
          "Two 500 g robots with μ = 0.8. Robot A is 2WD with 70 percent of its weight on the drive wheels: F_t = 0.8 × 0.7 × 4.905 ≈ 2.75 N. Robot B is 4WD: F_t = 0.8 × 4.905 ≈ 3.92 N. In a straight shove, B has about 1.2 N more traction-limited force, provided its motors can deliver it."
      }
    ],
    commonMistakes: [
      {
        mistake: "Adding more powerful motors to fix wheel spin",
        why: "Wheel spin means traction, not torque, is the limit; more torque only spins the wheels harder.",
        fix: "Increase N_driven (ballast, weight distribution, 4WD) or μ (better, cleaner tyres)."
      },
      {
        mistake: "Powering logic from a sagging motor battery with no protection",
        why: "Near-stall current pulls the voltage down and can brown out the microcontroller.",
        fix: "Use a healthy battery, thick short wires, a bulk capacitor near the driver, or a separate logic supply."
      },
      {
        mistake: "Ignoring the opponent's traction",
        why: "Your net push is your traction minus theirs; equal robots stalemate.",
        fix: "Use a wedge to lift the opponent and reduce their normal force."
      }
    ],
    keyTakeaways: [
      "Traction F_t ≤ μ × N_driven; acceleration is limited to a_max = μ × N_driven / m.",
      "4WD puts nearly all the weight on driven wheels.",
      "Small slip gives peak traction; full wheel spin gives less.",
      "Near-stall pushes draw high current and sag the battery voltage.",
      "A brown-out reset mid-match restarts the program, including the start delay."
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "LiPo 2S Battery", "TB6612FNG", "Arduino Uno R3"],
    youtubeSearch: "robot traction wheel slip 4WD vs 2WD sumo",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A robot has all its weight on its driven wheels and tyre friction μ = 0.8. What is its maximum possible acceleration? (g = 9.81 m/s²)",
        options: ["0.8 m/s²", "7.8 m/s²", "12.3 m/s²", "78 m/s²"],
        answerIndex: 1,
        explanation:
          "a_max = μ × g = 0.8 × 9.81 ≈ 7.8 m/s². Mass cancels out when all weight is on driven wheels. 12.3 m/s² comes from dividing g by μ instead of multiplying.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does the soft-start step code print?",
        code: `void setup() {
  Serial.begin(9600);
  int speed = 0;
  int steps = 0;
  while (speed < 200) {
    speed += 45;
    steps++;
  }
  Serial.print(steps);
  Serial.print(" ");
  Serial.println(speed);
}

void loop() {}`,
        options: ["4 180", "5 200", "5 225", "4 225"],
        answerIndex: 2,
        explanation:
          "speed goes 45, 90, 135, 180 (still < 200), then 225, which ends the loop after 5 steps. The loop never lands exactly on 200, so '5 200' is wrong; '4 180' stops one step too early because 180 is still less than 200.",
        difficulty: 2
      },
      {
        type: "predict-circuit",
        prompt:
          "An Arduino is powered through Vin from the same 2S pack as the motors. During a long head-on push both motors approach stall and an old, high-resistance battery's voltage sags sharply. What is the most likely electrical consequence?",
        options: [
          "The Arduino may brown out and reset, restarting from setup()",
          "The motor current drops to zero",
          "The battery voltage rises above 8.4 V",
          "The ultrasonic sensor range doubles"
        ],
        answerIndex: 0,
        explanation:
          "High near-stall current through the battery's internal resistance lowers the terminal voltage (V = E − I·R). If it falls below what the regulator needs, the microcontroller resets and runs setup() again, often including the start delay. The current does not drop to zero, and the voltage falls rather than rises.",
        difficulty: 3
      },
      {
        type: "mcq",
        prompt: "Your robot spins its wheels in every shoving match. Which change is MOST likely to help?",
        options: [
          "Fit motors with twice the torque",
          "Raise the battery higher on the chassis",
          "Increase the serial baud rate",
          "Move ballast over the driven wheels and clean the tyres"
        ],
        answerIndex: 3,
        explanation:
          "Wheel spin means the traction limit μN has been reached. Increasing N on driven wheels and restoring μ raises that limit. More torque only spins the wheels harder, and raising the battery makes stability worse.",
        difficulty: 1
      }
    ]
  })
];
