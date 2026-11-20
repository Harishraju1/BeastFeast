import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_04: Topic[] = [
  defineTopic("sumo", 4, {
    slug: "sumo-chassis-construction",
    title: "Chassis Construction",
    minutes: 10,
    summary: "Materials, stiffness, fastening and layout techniques for building a strong, low, rule-compliant sumo chassis.",
    introduction:
      "The chassis is the skeleton that holds every part in place and transmits pushing force from the wheels to the opponent. In sumo it must survive hard collisions, stay rigid so the wedge keeps touching the ring, and help you reach the weight limit with mass in the right places. This topic covers materials, construction methods and practical assembly details.",
    beginner:
      "Imagine trying to push a heavy cupboard while standing on a wobbly skateboard. Your strength is wasted because the board flexes and slides. A sumo chassis is the 'board' your motors stand on. If it bends, twists or rattles, some of the motor's effort is lost and the wedge can lift off the floor at the worst moment.\n\nGood sumo chassis are stiff, low and dense. Many builders use a flat base plate of aluminium, steel or fibreglass circuit board (FR4), with the motors clamped underneath or inside. Some 3D-print the frame in PLA or PETG and then add steel weights. Acrylic looks nice but can crack in a hard collision.\n\nScrews matter too. Small M2 or M3 screws with nuts or threaded inserts hold parts securely, and a drop of threadlocker stops them shaking loose. Wires should be tied down so the opponent's wedge cannot catch them. Finally, the whole robot must fit in the 10 × 10 cm box, so measure everything, including tyres and switch levers, before you finalise the design.",
    technical: [
      {
        heading: "Material choice by density and stiffness",
        body:
          "Mass m = density × volume. For a 10 × 10 cm base plate 2 mm thick (V = 10 × 10 × 0.2 = 20 cm³):\n\n- Aluminium (≈ 2.7 g/cm³): ≈ 54 g\n- Steel (≈ 7.85 g/cm³): ≈ 157 g\n- FR4 fibreglass (≈ 1.85 g/cm³): ≈ 37 g\n- PLA (≈ 1.24 g/cm³): ≈ 25 g\n\nBecause sumo robots usually need ballast anyway, a dense steel base plate is attractive: it is both structure and ballast, and it sits as low as possible. Aluminium is easier to cut and drill. 3D-printed parts allow complex shapes but are less stiff, so add ribs and keep printed walls thick."
      },
      {
        heading: "Stiffness and load paths",
        body:
          "When the robot pushes, the force path is: tyre contact → wheel → motor shaft and gearbox → motor mount → chassis → wedge → opponent. Any compliant link in this path (a flexible printed bracket, a loose screw) deflects under load. A flexing chassis can lift the wedge edge off the ring, letting the opponent slide underneath.\n\nGood practice:\n\n- Clamp all four motors (two per side on the club's 4WD layout) in metal brackets or tight printed cradles, not with hot glue alone.\n- Use at least two screws per bracket so it cannot rotate.\n- Box sections or folded edges dramatically increase bending stiffness compared with a flat plate of the same mass."
      },
      {
        heading: "Fasteners, clearance and wiring",
        body:
          "- Use M2/M3 machine screws with nylon-insert lock nuts or threadlocker; vibration loosens plain nuts.\n- In printed parts, heat-set threaded inserts last far longer than screws driven into plastic.\n- Keep ground clearance small under the body (a few millimetres) so opponents struggle to get underneath, but ensure the wedge and wheels, not the base plate, set the ride height.\n- Route wires inside the body and secure them; exposed loops can be snagged.\n- Leave access to the battery connector, power switch and USB port for tuning between rounds."
      }
    ],
    workingPrinciple:
      "A chassis works by holding every component in a fixed geometric relationship and by carrying loads along stiff paths. Stiffness keeps the wheels, wedge and sensors aligned under the large forces of a push; density and low mounting place mass where it increases traction and stability; and secure fastening prevents the gradual loosening that changes geometry during a competition.",
    diagrams: [
      {
        kind: "flow",
        steps: [
          "Tyre contact patch",
          "Wheel and hub",
          "Motor shaft and gearbox",
          "Motor mount bracket",
          "Chassis base plate",
          "Front wedge",
          "Opponent"
        ]
      },
      {
        kind: "formula",
        latexish: "m = ρ · V = ρ · (L · W · t)",
        legend: { m: "plate mass (g)", "ρ": "material density (g/cm³)", L: "length (cm)", W: "width (cm)", t: "thickness (cm)" }
      }
    ],
    examples: [
      {
        title: "Steel base plate as ballast",
        body:
          "A builder's electronics and motors weigh 260 g. A 9.5 × 9.5 cm steel plate 3 mm thick has volume 9.5 × 9.5 × 0.3 ≈ 27.1 cm³ and mass ≈ 27.1 × 7.85 ≈ 213 g. Total ≈ 473 g, leaving about 27 g for screws, wedge and margin. The plate provides stiffness and puts over 40 percent of the robot's mass at the lowest possible height."
      },
      {
        title: "Assembly checklist before every event",
        body:
          "- Every motor bracket screw tight and threadlocked.\n- Wheels secured on shafts (grub screws on flats, not round shaft).\n- No wire loops outside the body.\n- Robot fits the 10 × 10 cm test box with tyres included.\n- Wedge edge touches the floor evenly across its width when the robot sits on a flat surface.\n- Mass checked on a scale with the battery installed."
      }
    ],
    commonMistakes: [
      {
        mistake: "Holding motors with hot glue only",
        why: "Hot glue creeps and breaks under shock loads; motors shift and the robot starts to veer or the gearbox misaligns.",
        fix: "Use proper metal motor brackets or tight printed cradles with screws."
      },
      {
        mistake: "Using thin acrylic as the main structure",
        why: "Acrylic is brittle and can crack around screw holes during collisions.",
        fix: "Use aluminium, steel, FR4 or thick-walled PETG/PLA with reinforcing ribs."
      },
      {
        mistake: "Connecting motor wires directly to Arduino pins",
        why: "Motors draw far more current than an Arduino pin can supply (40 mA absolute maximum, 20 mA recommended); the pin or board can be damaged.",
        fix: "Always drive motors through a motor driver such as TB6612FNG, DRV8833 or L298N."
      }
    ],
    keyTakeaways: [
      "Mass = density × volume: steel plates give structure and ballast at once.",
      "Stiff load paths keep the wedge on the floor during a push.",
      "Secure motors with brackets and screws, and use threadlocker or lock nuts.",
      "Keep wires inside and the ride height set by wheels and wedge.",
      "Check the finished robot in a 10 × 10 cm test box with tyres included."
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "Motor Mounting Brackets", "Arduino Nano", "TB6612FNG"],
    youtubeSearch: "mini sumo robot chassis build steel plate",
    quiz: [
      {
        type: "mcq",
        prompt: "Why is a flexible chassis a problem during a push?",
        options: [
          "It makes the Arduino run slower",
          "It makes the ultrasonic sensor read further",
          "It increases the battery voltage",
          "It can lift the wedge edge off the ring so the opponent slides under it"
        ],
        answerIndex: 3,
        explanation:
          "Under load a flexible chassis deflects, and the wedge edge can rise off the floor, giving the opponent a gap to get underneath. Flexing has no effect on processor speed or battery voltage.",
        difficulty: 1
      },
      {
        type: "calculate",
        prompt:
          "An aluminium base plate measures 10 cm × 10 cm × 0.2 cm. Aluminium density is about 2.7 g/cm³. What is its mass?",
        options: ["27 g", "54 g", "157 g", "5.4 g"],
        answerIndex: 1,
        explanation:
          "Volume = 10 × 10 × 0.2 = 20 cm³. Mass = 20 × 2.7 = 54 g. 157 g is the mass of the same plate in steel (density about 7.85 g/cm³), and 27 g forgets that the volume is 20 cm³, not 10.",
        difficulty: 1
      },
      {
        type: "identify-component",
        prompt:
          "Which part is designed to clamp a small micro-metal gear motor's gearbox to the chassis using two screws?",
        options: [
          "N20 motor mount bracket",
          "Heat-set insert",
          "Brass standoff",
          "Servo horn"
        ],
        answerIndex: 0,
        explanation:
          "An N20 motor bracket wraps around the gearbox and has screw holes to fix it to the chassis. A heat-set insert provides a threaded hole in plastic but does not hold the motor by itself; a standoff spaces boards apart.",
        difficulty: 1
      },
      {
        type: "find-wrong-connection",
        prompt:
          "Which item in this build plan is WRONG?\n\nA) Motor A terminals → TB6612FNG AO1 and AO2\nB) Motor B terminals → Arduino D9 and D10\nC) TB6612FNG PWMA → Arduino D5\nD) Battery − → TB6612FNG GND and Arduino GND",
        options: ["A", "B", "C", "D"],
        answerIndex: 1,
        explanation:
          "Motors must never be connected straight to Arduino pins; a pin is limited to 40 mA absolute maximum, while a motor needs hundreds of milliamps or more. Motor B should go to BO1/BO2 on the driver. A, C and D are correct driver and ground connections.",
        difficulty: 2
      }
    ]
  }),

  defineTopic("sumo", 5, {
    slug: "sumo-centre-of-gravity",
    title: "Centre of Gravity",
    minutes: 10,
    summary: "How to calculate and lower the centre of gravity, and why a low CoG makes a sumo robot harder to lift, tip or push out.",
    introduction:
      "The centre of gravity (CoG) is the single point where the robot's weight can be considered to act. Its height and position decide how easily the robot tips, how weight is shared between wheels and wedge, and how the robot behaves when an opponent's wedge gets under it. Engineers calculate it, then move parts to put it where they want.",
    beginner:
      "Try balancing a broom on your hand: it is tricky because most of its weight is far from your hand. Now lay the broom on the floor: it cannot fall over at all. Things with their weight low down are stable; things with their weight high up tip easily. That 'balance point' of an object is its centre of gravity.\n\nFor a sumo robot, a low centre of gravity is a huge advantage. When an opponent pushes on the front of your robot or slides a wedge under it, a robot with its weight high up will rock backwards, lose grip and get pushed out. A robot with its weight low stays flat on the floor, keeps its wheels gripping and resists the push.\n\nYou lower the centre of gravity by mounting heavy parts — battery, motors, steel plates — as close to the floor as possible, and keeping light parts like circuit boards and sensors higher. You can even find your robot's balance point by resting it on a pencil and moving it until it balances. Later in this topic you will learn how to calculate it with simple maths.",
    technical: [
      {
        heading: "Calculating the centre of gravity",
        body:
          "For parts with masses m₁, m₂, … at positions x₁, x₂, …:\n\nx_cg = (Σ mᵢ xᵢ) / (Σ mᵢ)\n\nThe same formula applies to height (h_cg) and sideways position (y_cg).\n\nWorked example (heights above the floor):\n- Steel plate 200 g at 0.3 cm\n- Motors 30 g at 1.2 cm\n- Battery 40 g at 2.0 cm\n- Electronics 30 g at 3.5 cm\n\nh_cg = (200×0.3 + 30×1.2 + 40×2.0 + 30×3.5) / 300 = (60 + 36 + 80 + 105) / 300 = 281 / 300 ≈ 0.94 cm.\n\nMoving the battery from 2.0 cm to 5.0 cm raises h_cg to (281 + 120)/300 ≈ 1.34 cm."
      },
      {
        heading: "Tipping and the stability condition",
        body:
          "A robot resting on a tipping edge (for example its rear wheels) will rotate about that edge if the overturning moment exceeds the restoring moment:\n\nF × h > m × g × d\n\nwhere F is a horizontal force applied at height h, and d is the horizontal distance from the CoG to the tipping edge. Lowering the point of contact (h) and keeping the CoG well inside the support base (large d) both make tipping harder.\n\nExample: m = 0.5 kg, d = 3 cm, so the restoring moment is 0.5 × 9.81 × 0.03 ≈ 0.147 N·m. A 4 N push applied 4 cm high gives 0.16 N·m — enough to start tipping. At 2 cm high it gives only 0.08 N·m."
      },
      {
        heading: "CoG and wedge battles",
        body:
          "When an opponent's wedge gets under your front edge, it lifts you; your weight shifts toward the rear contact and your front wedge loses contact. A low CoG reduces the lift moment and keeps more weight on your wheels. Robots that are long and low with the CoG near the middle of the support base are the hardest to lift."
      }
    ],
    workingPrinciple:
      "Gravity acts on every part of the robot, but the combined effect is identical to the total weight acting at the centre of gravity. Stability depends on where that point sits relative to the edges of the support base: as long as the line of action of weight falls inside the base and the restoring moment m·g·d exceeds any overturning moment, the robot stays flat. Lower CoG means smaller overturning moments for the same push height.",
    diagrams: [
      {
        kind: "formula",
        latexish: "x_cg = Σ(mᵢ · xᵢ) / Σ mᵢ",
        legend: { x_cg: "position of the centre of gravity", "mᵢ": "mass of part i", "xᵢ": "position of part i's own centre" }
      },
      {
        kind: "signal",
        title: "Centre of gravity height vs battery mounting height (300 g robot, 40 g battery)",
        series: [
          { label: "CoG height (cm)", points: [[1, 0.8], [2, 0.94], [3, 1.07], [4, 1.2], [5, 1.34]] }
        ],
        xLabel: "Battery height above floor (cm)",
        yLabel: "CoG height (cm)"
      }
    ],
    examples: [
      {
        title: "Balance-point test",
        body:
          "Place the finished robot crosswise on a round pencil and roll the pencil until the robot balances. Mark that line. Turn the robot 90° and repeat. Where the two lines cross (viewed from above) is the CoG in plan. For height, tilt the robot on its rear wheels and find the angle where it balances; the CoG lies directly above the wheel contact at that angle."
      },
      {
        title: "Computing CoG in code",
        body:
          "A quick sketch to compute the CoG position from a parts list. It uses float so fractional results are kept.",
        code: `const int N = 4;
float mass[N] = {200, 30, 40, 30};   // grams
float height[N] = {0.3, 1.2, 2.0, 3.5}; // cm

void setup() {
  Serial.begin(9600);
  float sumM = 0;
  float sumMH = 0;
  for (int i = 0; i < N; i++) {
    sumM += mass[i];
    sumMH += mass[i] * height[i];
  }
  Serial.print("CoG height (cm): ");
  Serial.println(sumMH / sumM); // prints 0.94
}

void loop() {}`
      }
    ],
    commonMistakes: [
      {
        mistake: "Mounting the battery on top 'because it is easy to reach'",
        why: "The battery is one of the heaviest parts; placing it high raises the CoG significantly.",
        fix: "Mount the battery low, between the wheels, with a connector lead long enough to reach the switch."
      },
      {
        mistake: "Using int for CoG calculations",
        why: "Integer division discards the fraction, so 2200 / 500 gives 4 instead of 4.4.",
        fix: "Use float variables (or multiply by 10 or 100 first) when you need fractional results."
      },
      {
        mistake: "Thinking a heavier robot is automatically more stable",
        why: "Mass placed high can make a heavier robot easier to tip than a lighter, lower one.",
        fix: "Consider both mass and height; calculate h_cg and check the tipping condition."
      }
    ],
    keyTakeaways: [
      "The CoG is the weighted average position: x_cg = Σ m·x / Σ m.",
      "A low CoG makes the robot harder to tip and harder to lift with a wedge.",
      "Tipping starts when F × h exceeds m × g × d.",
      "Heavy parts (battery, motors, steel) belong as low as possible.",
      "Use float or scaled integers when calculating CoG on an Arduino."
    ],
    relatedComponents: ["LiPo 2S Battery", "N20 Micro Metal Gear Motor", "Arduino Nano"],
    youtubeSearch: "centre of gravity robot stability explained",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A robot has a 400 g lower section with its centre at 1 cm height and a 100 g upper section with its centre at 6 cm height. What is the height of the CoG?",
        options: ["3.5 cm", "2.0 cm", "1.0 cm", "7.0 cm"],
        answerIndex: 1,
        explanation:
          "h_cg = (400×1 + 100×6) / 500 = (400 + 600) / 500 = 2.0 cm. 3.5 cm is the simple average of 1 and 6, which ignores that most of the mass is in the lower section.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt:
          "Two robots have equal mass and identical tyres. Robot A's battery is mounted 6 cm high; Robot B's is mounted 1 cm high. Robot B's wedge gets under Robot A's front edge and B drives forward. What is most likely to happen?",
        options: [
          "Robot A rocks back, loses wheel grip and is pushed out",
          "Robot B tips over backwards",
          "Both robots stop dead because their masses are equal",
          "Robot A pushes Robot B out because A is taller"
        ],
        answerIndex: 0,
        explanation:
          "A's higher CoG gives a larger overturning moment when lifted, so it rocks back and its traction drops, letting B push it out. Equal mass does not mean equal stability; CoG height and wedge position matter. Being taller is a disadvantage, not an advantage.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Which change lowers a sumo robot's centre of gravity the most?",
        options: [
          "Moving the 40 g battery from the top plate to beneath the chassis",
          "Replacing a 5 g sensor bracket with a 3 g one",
          "Adding a 10 g flag on a mast",
          "Swapping red wires for black wires"
        ],
        answerIndex: 0,
        explanation:
          "Moving a heavy component a large vertical distance has the biggest effect on Σ m·h. Saving 2 g on a bracket changes the CoG very little, and a flag on a mast raises the CoG.",
        difficulty: 1
      },
      {
        type: "code-output",
        prompt: "What does this Arduino Uno code print?",
        code: `void setup() {
  Serial.begin(9600);
  int m1 = 300; int x1 = 2;
  int m2 = 200; int x2 = 8;
  int cg = (m1 * x1 + m2 * x2) / (m1 + m2);
  Serial.println(cg);
}

void loop() {}`,
        options: [
          "4.4",
          "4.40",
          "5",
          "4"
        ],
        answerIndex: 3,
        explanation:
          "(300×2 + 200×8) = 600 + 1600 = 2200 (fits in a 16-bit int). 2200 / 500 with integers is 4 — the .4 is discarded. 4.4 is the true value, but integer division truncates, and println of an int never prints a decimal point. Use float to get 4.40.",
        difficulty: 2
      }
    ]
  }),

  defineTopic("sumo", 6, {
    slug: "sumo-weight-distribution",
    title: "Weight Distribution",
    minutes: 10,
    summary: "How the robot's weight is shared between driven wheels, wedge and skids, and how to tune that split for maximum pushing force.",
    introduction:
      "Knowing your total mass is not enough. What matters for pushing is how much of that weight presses on the driven wheels, because only those wheels convert motor torque into force. The rest may sit on a wedge or skid that produces no drive at all. This topic shows how to calculate the split with a moment balance and how to tune it.",
    beginner:
      "Imagine pushing a wheelbarrow full of sand. If the sand is piled near the wheel, the barrow is easy to steer and push. If it is piled near the handles, you carry most of the weight in your arms. Where the weight sits changes which part of the system does the work.\n\nIn a sumo robot only the driven wheels can push. If most of the robot's weight rests on the front wedge or on a skid, the driven wheels are pressed lightly onto the floor and will spin as soon as the opponent resists. If most of the weight rests on the driven wheels, they grip hard and the robot pushes strongly.\n\nBut there is a balance. The wedge also needs some weight so it stays pressed to the floor and scoops under the opponent instead of riding up over it. Builders therefore aim for most of the weight on the driven wheels with just enough on the wedge to keep it scraping the floor. You can check the split by placing the wheels on one kitchen scale and the wedge on another, then adjusting ballast until the numbers look right.",
    technical: [
      {
        heading: "Moment balance for a robot with a front wedge",
        body:
          "On the club's 4WD mini-sumo both axles are driven, so the question is how much weight the wedge takes away from the wheels. A simple model treats the four wheels as one support (the axle line, midway between the front and rear axles) and the wedge edge as the other, separated by a horizontal distance L. Let the CoG be a distance x in front of the axle line. Taking moments about the wedge contact:\n\nN_wheels × L = W × (L − x)  ⇒  N_wheels = W × (L − x) / L\nN_wedge = W − N_wheels = W × x / L\n\nExample: m = 0.5 kg (W ≈ 4.905 N), L = 8 cm, x = 2 cm. N_wheels = 4.905 × 6 / 8 ≈ 3.68 N (75%), N_wedge ≈ 1.23 N (25%). With μ = 0.9 the traction limit becomes 0.9 × 3.68 ≈ 3.31 N rather than 4.41 N if all weight were on the wheels."
      },
      {
        heading: "Weight transfer while pushing",
        body:
          "The static split changes during a push. Pushing force acts at the wedge contact and the drive force acts at the tyre contact, both near floor level, so in a low robot the transfer is small. However, if the opponent's wedge lifts your front, part of your weight now rests on their wedge instead of your own, your wedge loses contact, and if they lift you further your wheels unload and lose traction. If you lift the opponent, part of their weight rests on your wedge: their driven wheels lose normal force (and therefore pushing ability), while the extra load on your wedge adds no drive force to you.\n\nThis is why the club builds 4WD sumo robots: apart from the lightly loaded wedge edge, every contact point that carries weight is also driven, so nearly the whole robot weight contributes to traction. A 2WD robot resting on an unpowered skid or caster loses that share."
      },
      {
        heading: "Left–right balance",
        body:
          "If the CoG is off-centre sideways, one wheel carries more load. That wheel gets more traction; the other slips first, so the robot yaws (turns) during a hard push even when both motors receive the same PWM. Keep heavy parts symmetric, and check with two scales placed under the left and right wheels. Small software trims can compensate for motor mismatch, but they cannot fully fix a large traction imbalance."
      }
    ],
    workingPrinciple:
      "Weight distribution follows static equilibrium: the sum of vertical support forces equals the weight, and the sum of moments about any point is zero. Moving ballast toward the driven wheels (between the axles on a 4WD robot) increases N_wheels and therefore the friction-limited pushing force μ·N_wheels, while keeping enough load on the wedge to hold its edge down against the floor.",
    diagrams: [
      {
        kind: "formula",
        latexish: "N_wheels = W · (L − x) / L",
        legend: {
          N_wheels: "normal force on the driven wheels (N)",
          W: "robot weight m·g (N)",
          L: "distance from the wheels' axle line to the wedge contact (cm)",
          x: "distance of CoG in front of the axle line (cm)"
        }
      },
      {
        kind: "signal",
        title: "Share of weight on driven wheels vs CoG position (L = 8 cm)",
        series: [{ label: "Weight on wheels (%)", points: [[0, 100], [1, 87.5], [2, 75], [3, 62.5], [4, 50], [6, 25]] }],
        xLabel: "CoG distance in front of axle x (cm)",
        yLabel: "Weight on wheels (%)"
      }
    ],
    examples: [
      {
        title: "Two-scale measurement",
        body:
          "Stand all four driven wheels on one kitchen scale (on a small flat board if needed) and the wedge edge on another scale of the same height. A 490 g robot reads 355 g under the wheels and 135 g under the wedge: 72 percent on the wheels. Moving a 40 g ballast block 3 cm rearward (toward the wheels) shifts roughly 40 × 3 / L grams. With L = 8 cm that is about 15 g, giving about 370 g / 120 g (76 percent)."
      },
      {
        title: "Compensating a slight motor mismatch with integer-safe trim",
        body:
          "If the robot drifts because one side is weaker, apply a small percentage trim. Multiply before dividing (and use long) so integer division does not zero the result.",
        code: `const int LEFT_PWM = 5;
const int RIGHT_PWM = 6;
const int LEFT_TRIM_PERCENT = 95;

void setup() {
  pinMode(LEFT_PWM, OUTPUT);
  pinMode(RIGHT_PWM, OUTPUT);
}

void loop() {
  int base = 255;
  int left = (long)base * LEFT_TRIM_PERCENT / 100; // 242
  analogWrite(LEFT_PWM, left);
  analogWrite(RIGHT_PWM, base);
}`
      }
    ],
    commonMistakes: [
      {
        mistake: "Putting all the ballast at the very front behind the wedge",
        why: "Weight on an undriven wedge does not create drive force; the wheels are unloaded and spin.",
        fix: "Place most ballast low over the driven wheels, between the front and rear axles; keep only enough on the wedge to hold it down."
      },
      {
        mistake: "Lifting the wedge completely off the floor to 'maximise' wheel load",
        why: "An opponent's wedge can then slide underneath, lifting your whole robot.",
        fix: "Keep the wedge edge lightly loaded so it scrapes the ring surface."
      },
      {
        mistake: "Writing trim as 95 / 100 * 255",
        why: "95 / 100 is 0 in integer maths, so the motor gets PWM 0.",
        fix: "Multiply first: (long)255 * 95 / 100, or use float."
      }
    ],
    keyTakeaways: [
      "Only weight on driven wheels produces traction for pushing.",
      "N_wheels = W × (L − x) / L for a two-support robot.",
      "Keep just enough load on the wedge to hold its edge to the floor.",
      "Side-to-side imbalance makes the robot yaw during a hard push.",
      "Measure the split with two scales and adjust ballast position."
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "LiPo 2S Battery", "Arduino Nano", "TB6612FNG"],
    youtubeSearch: "sumo robot weight distribution traction ballast",
    quiz: [
      {
        type: "calculate",
        prompt:
          "A 500 g robot (W ≈ 4.9 N) rests on its driven axle and its wedge edge, 8 cm apart. The CoG is 2 cm in front of the axle. Approximately what normal force acts on the driven wheels?",
        options: ["1.2 N", "2.5 N", "3.7 N", "4.9 N"],
        answerIndex: 2,
        explanation:
          "N_wheels = W × (L − x) / L = 4.9 × 6 / 8 ≈ 3.7 N. 1.2 N is the load on the wedge (W × x / L), a common mix-up. 4.9 N would only be true if the CoG were directly over the axle.",
        difficulty: 3
      },
      {
        type: "predict-movement",
        prompt:
          "A robot carries 80 percent of its weight on its unpowered front wedge and 20 percent on its rear drive wheels. It meets an opponent head-on and both drive forward. What happens to this robot?",
        options: [
          "Its drive wheels spin and it is pushed back",
          "It lifts the opponent and wins easily",
          "It turns sharply left",
          "It accelerates faster than normal"
        ],
        answerIndex: 0,
        explanation:
          "With only 20 percent of its weight on the driven wheels, the friction limit μ·N_wheels is small, so the wheels break traction and spin. The heavy wedge resists being lifted but cannot create any drive force, so the robot loses the shoving match.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Why should a little weight remain on the front wedge rather than none?",
        options: [
          "So the wedge edge stays pressed to the floor and opponents cannot slide under it",
          "So the motor driver stays cool",
          "So the edge sensors read the white line",
          "Because the rules require it"
        ],
        answerIndex: 0,
        explanation:
          "A lightly loaded wedge keeps scraping the ring, so the opponent meets the sloped face instead of a gap. Driver temperature and edge sensor readings are unrelated to wedge loading.",
        difficulty: 1
      },
      {
        type: "debug-code",
        prompt: "The left motor never turns, although the wiring is correct. What is the bug?",
        code: `const int LEFT_PWM = 5;

void setup() {
  pinMode(LEFT_PWM, OUTPUT);
}

void loop() {
  int leftSpeed = 95 / 100 * 255; // 95% trim
  analogWrite(LEFT_PWM, leftSpeed);
}`,
        options: [
          "Pin 5 cannot output PWM on an Arduino Uno",
          "pinMode must be INPUT for analogWrite",
          "analogWrite needs a value between 0 and 1023",
          "95 / 100 is 0 in integer arithmetic, so leftSpeed is 0"
        ],
        answerIndex: 3,
        explanation:
          "Both 95 and 100 are integers, so 95 / 100 evaluates to 0, and 0 × 255 = 0. Write (long)255 * 95 / 100 to get 242. Pin 5 is a PWM pin on the Uno (3, 5, 6, 9, 10, 11), and analogWrite takes 0–255, not 0–1023 (that is the analogRead range).",
        difficulty: 2
      }
    ]
  })
];
