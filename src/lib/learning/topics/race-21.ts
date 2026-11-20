import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_21: Topic[] = [
  // ---------------------------------------------------------------- 21
  defineTopic("race", 21, {
    slug: "turning-mechanics",
    title: "Turning Mechanics",
    minutes: 14,
    summary: "The physics of cornering: centripetal force, the maximum speed for a given radius, scrub in skid-steer robots and choosing between pivot, spin and arc turns.",
    introduction:
      "Every corner on a race track asks one question: how fast can you go around this curve without sliding off or tipping over? The answer comes from simple physics that you can calculate before you build.\n\nThis topic explains centripetal acceleration, the grip-limited cornering speed v = sqrt(mu g R), how the inner and outer wheels must move during an arc, why 4WD skid-steer robots fight themselves in corners, and when to use a spin, pivot or smooth arc.",
    beginner:
      "When you ride a bike around a corner, you feel pushed outward. Really, your body wants to keep going straight, and the tyres have to pull you inward to make you follow the curve. That inward pull comes from friction between the tyres and the ground.\n\nThere is a limit to how much friction the tyres can give. If you go too fast for a tight corner, the tyres cannot pull hard enough, and you slide outward. Tighter corners need slower speeds; wider corners allow faster speeds. Grippier tyres raise the limit for every corner.\n\nA robot turns by running its outer wheels faster than its inner wheels. The outer side travels a longer path around the bend, just as runners in the outside lane of a running track run further. On a smooth arc both sides roll forward at different speeds.\n\nThere are three turn styles. An arc is smooth and fast, like a car on a curve. A pivot stops one side and swings around it. A spin runs the two sides in opposite directions so the robot rotates on the spot. Spins and pivots are useful for very sharp 90-degree turns, but they kill your forward speed. Good race robots use the smoothest arc the track allows.\n\nThe club's 4WD robots have four driven wheels and no steering, so they drag some wheels sideways to turn. That wastes energy and makes corners less predictable, so plan for it.",
    technical: [
      {
        heading: "Centripetal force and the cornering speed limit",
        body:
          "To follow a circle of radius R at speed v, the robot needs centripetal acceleration a_c = v^2 / R towards the centre. The only source of that force is tyre friction, at most mu x m x g. Setting m v^2 / R <= mu m g gives the grip-limited cornering speed:\n\nv_max = sqrt(mu x g x R)\n\nMass cancels out, so a heavier robot does not corner slower in theory (though heavier robots load the tyres more and real tyre grip often falls a little with load).\n\nWorked example: R = 0.3 m, mu = 0.8. v_max = sqrt(0.8 x 9.81 x 0.3) = sqrt(2.35) = 1.53 m/s. Halving the radius to 0.15 m drops v_max to 1.08 m/s (by a factor of sqrt(2))."
      },
      {
        heading: "Wheel speeds in an arc",
        body:
          "For a turn of radius R (measured to the robot's centre) at angular velocity w = v / R with track width b:\n\n- Inner wheel: v_in = w (R - b/2)\n- Outer wheel: v_out = w (R + b/2)\n\nExample: R = 0.3 m, b = 0.12 m, v = 1.0 m/s: w = 3.33 rad/s, v_in = 0.80 m/s, v_out = 1.20 m/s. If the outer wheel's maximum speed is 1.2 m/s, you cannot take this corner faster without more motor speed, even if the tyres had more grip. Corner speed is limited by min(grip limit, outer-wheel speed limit)."
      },
      {
        heading: "Pivot, spin and arc",
        body:
          "- Spin (vL = -vR): R = 0, forward speed 0. Sharpest turn, no forward progress; wastes time unless the corner is a true right angle.\n- Pivot (one wheel stopped): R = b/2. Still very slow overall.\n- Arc: R > b/2. Keeps forward speed; the fastest line through a curve uses the largest radius the track allows.\n\nOn line-guided race tracks, the line forces the path, so your job is to choose the highest speed at which the controller still tracks the line's radius."
      },
      {
        heading: "Scrub in skid-steer (4WD) robots",
        body:
          "A 4WD robot with fixed wheels has its front and rear wheels offset from the turning centre, so they must slip sideways to rotate the chassis. The sideways scrub friction creates a resisting torque. Consequences: the motors need more torque to turn than to go straight, current spikes in tight turns, and the actual turn rate is lower and less repeatable than the kinematic equations predict. A shorter wheelbase relative to track width reduces scrub, which is why the club's standard 4WD chassis is short and wide. For comparison, a 2WD robot with a ball caster has almost no scrub, but it gives up the grip of four driven wheels."
      }
    ],
    workingPrinciple:
      "A body moving in a circle continuously changes direction, which requires a net inward force m v^2 / R. On a robot that force is supplied by lateral friction at the tyres. When the needed force exceeds mu x m x g, the tyres slide and the robot drifts outward. The robot generates the rotation itself by running the outer wheel faster than the inner wheel, in the ratio (R + b/2) / (R - b/2).",
    diagrams: [
      {
        kind: "formula",
        latexish: "v_{max} = \\sqrt{\\mu g R};   v_{in} = \\omega (R - b/2);   v_{out} = \\omega (R + b/2)",
        legend: { "\\mu": "tyre friction coefficient", g: "9.81 m/s^2", R: "turn radius to robot centre (m)", b: "track width (m)", "\\omega": "turn rate v/R (rad/s)" }
      },
      {
        kind: "signal",
        title: "Grip-limited cornering speed vs radius (mu = 0.8)",
        xLabel: "radius R (m)",
        yLabel: "v_max (m/s)",
        series: [
          { label: "mu = 0.8", points: [[0.1, 0.89], [0.2, 1.25], [0.3, 1.53], [0.4, 1.77], [0.5, 1.98]] }
        ]
      }
    ],
    examples: [
      {
        title: "Corner speed table for your track",
        body: "Measure each corner's radius on the track (lay a string along the line). Compute v_max = sqrt(mu g R) using a mu you measured with a tilt test (tilt a board with the robot on it until it slides: mu = tan(angle)). Then set your corner speed target to about 80% of v_max as a safety margin. Example with mu = 0.8: R = 0.2 m gives 1.25 m/s, target 1.0 m/s; R = 0.5 m gives 1.98 m/s, target 1.6 m/s."
      },
      {
        title: "Arc turn helper",
        body: "Computes the inner/outer PWM for an arc at a given radius by scaling the base PWM. Assumes PWM is roughly proportional to wheel speed, which is only approximately true; closed-loop speed control with encoders is better.",
        code: `const float TRACK_B = 0.12; // m

void arcPwm(int basePwm, float radius, int &leftPwm, int &rightPwm) {
  // left turn: left wheel is the inner wheel
  float inner = (radius - TRACK_B / 2) / radius;
  float outer = (radius + TRACK_B / 2) / radius;
  leftPwm = constrain((int)(basePwm * inner + 0.5), -255, 255);
  rightPwm = constrain((int)(basePwm * outer + 0.5), -255, 255);
}

void setup() {
  Serial.begin(9600);
  int l, r;
  arcPwm(180, 0.30, l, r);
  Serial.print(l);
  Serial.print(" ");
  Serial.println(r); // prints 144 216
}

void loop() {}`
      }
    ],
    commonMistakes: [
      { mistake: "Taking every corner as a spin turn.", why: "A spin drops forward speed to zero and costs time to re-accelerate.", fix: "Use arcs with the largest radius the track allows; reserve spins for true right angles." },
      { mistake: "Ignoring that the outer wheel must go faster than the base speed.", why: "If base speed is already near maximum, the outer wheel saturates and the robot under-turns.", fix: "Lower base speed in corners so the outer wheel has headroom." },
      { mistake: "Assuming a heavier robot needs a slower corner speed.", why: "In the ideal model mass cancels: v_max = sqrt(mu g R).", fix: "Focus on grip (mu) and line radius; reduce mass mainly for acceleration and braking." },
      { mistake: "Taking a 4WD skid-steer robot onto a twisty line track without testing its turns.", why: "Scrub makes turns weaker and less predictable, and raises current in corners.", fix: "Keep the wheelbase short relative to track width, test every corner type on a practice track, and lower corner speed if the robot runs wide." }
    ],
    keyTakeaways: [
      "Cornering needs inward force m v^2 / R, supplied only by tyre friction.",
      "Grip-limited corner speed is v_max = sqrt(mu g R); tighter corners mean lower speed.",
      "Outer wheel speed = w(R + b/2), inner = w(R - b/2).",
      "Arcs keep speed; pivots and spins sacrifice it.",
      "Skid-steer 4WD scrubs in turns, needing more torque and giving less predictable turning."
    ],
    relatedComponents: ["High-Grip Racing Wheels", "Silicone Robot Wheels", "N20 Micro Metal Gear Motor", "TB6612FNG", "Arduino Uno R3"],
    youtubeSearch: "robot cornering physics centripetal force friction turning radius",
    quiz: [
      {
        type: "calculate",
        prompt: "A corner has radius R = 0.5 m and the tyres have mu = 0.8. Using g = 9.8 m/s^2, what is the maximum speed before the robot slides?",
        diagram: { kind: "formula", latexish: "v_{max} = \\sqrt{\\mu g R}", legend: { "\\mu": "0.8", g: "9.8 m/s^2", R: "0.5 m" } },
        options: ["about 2.0 m/s", "about 1.0 m/s", "about 3.9 m/s", "about 0.4 m/s"],
        answerIndex: 0,
        explanation: "v_max = sqrt(0.8 x 9.8 x 0.5) = sqrt(3.92) = 1.98 m/s, about 2.0 m/s. 3.9 m/s is the value inside the square root (forgetting the root), and 0.4 m/s comes from using mu x R without g.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt: "A low, stable robot enters a curve at a speed well above sqrt(mu g R) for that curve. What happens?",
        options: [
          "It tips over towards the inside of the curve",
          "It follows the curve perfectly because the motors compensate",
          "It stops suddenly",
          "Its tyres slide and it drifts towards the outside of the curve, leaving the line"
        ],
        answerIndex: 3,
        explanation: "The required centripetal force exceeds the friction available, so the tyres slide and the robot travels on a wider path than the curve, drifting outward. A low robot slides before it tips, and if it did tip it would roll outward, not inward. The motors cannot create more lateral grip.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Why does a 4WD skid-steer robot usually need more motor torque to turn than a 2WD robot with a ball caster?",
        options: [
          "Four motors share the battery voltage",
          "Its wheels are always smaller",
          "Its front and rear wheels must slip sideways (scrub) to rotate the chassis, which creates resisting friction",
          "The ball caster on the 2WD robot pushes it around the corner"
        ],
        answerIndex: 2,
        explanation: "Fixed wheels away from the turning centre must slide sideways when the chassis rotates. That scrub friction resists the turn, so more torque is needed. Motors in parallel each see the full battery voltage, not a share, and a caster just swivels freely; it adds no turning force.",
        difficulty: 2
      },
      {
        type: "identify-component",
        prompt: "Which part, mounted at the front or rear of a 2WD race car, swivels freely so the robot can turn without scrubbing a third wheel sideways?",
        options: ["Wheel encoder", "Ball caster", "Gearbox", "Bumper switch"],
        answerIndex: 1,
        explanation: "A ball caster (or swivel caster) rolls in any direction, so it supports the chassis without resisting turns. An encoder measures rotation, a gearbox changes speed and torque, and a bumper switch detects contact; none of them provide free omnidirectional support.",
        difficulty: 1
      }
    ]
  }),

  // ---------------------------------------------------------------- 22
  defineTopic("race", 22, {
    slug: "centre-of-gravity",
    title: "Centre of Gravity",
    minutes: 13,
    summary: "Finding, measuring and placing your race car's centre of gravity to maximise grip, prevent tipping and keep the nose and sensors planted.",
    introduction:
      "The centre of gravity (CoG) is the single point where the whole weight of the robot can be considered to act. Its height decides whether the robot tips in corners; its front-to-back position decides how much weight presses on the drive wheels and sensors.\n\nThis topic shows how to calculate the CoG from component masses, how to measure it with two kitchen scales, and how to use the tipping and weight-transfer equations to place the battery and electronics for the best lap.",
    beginner:
      "Try balancing a ruler on your finger. There is exactly one point where it balances: that is its centre of gravity. For a robot, it is the balance point of everything together: chassis, motors, battery, boards and wires.\n\nWhy does it matter for racing? First, height. A tall bus tips over more easily on a sharp turn than a low sports car, because its weight sits high above the wheels. A low CoG lets your robot corner hard without rolling over.\n\nSecond, front-to-back position. The tyres can only grip as hard as they are pressed onto the track. On the club's 4WD cars all four wheels drive, so share the weight fairly evenly between the front and rear pairs. If one pair is barely loaded, those wheels slip first and waste power. If the weight sits too far back, the nose can lift when you accelerate, and the line sensors at the front rise off the track and start reading wrongly.\n\nThe battery is usually the heaviest single part, so where you put it is the biggest CoG decision you make. Mount it low and between the axles, and keep the sensor nose light but firmly on the ground.",
    technical: [
      {
        heading: "Calculating the CoG",
        body:
          "Choose an origin (for example the front edge of the chassis) and measure each component's position x_i and mass m_i. Then:\n\nx_cg = (sum of m_i x_i) / (sum of m_i), and similarly for y (sideways) and z (height).\n\nWorked example: chassis 200 g at x = 60 mm, battery 150 g at x = 20 mm, motors and wheels 100 g at x = 100 mm. x_cg = (200 x 60 + 150 x 20 + 100 x 100) / 450 = (12000 + 3000 + 10000) / 450 = 55.6 mm from the front edge."
      },
      {
        heading: "Measuring with two scales",
        body:
          "Place the front pair of wheels on one scale and the rear pair on another, with both scales level. If the rear scale reads W_r, the total is W, and the wheelbase (front axle to rear axle) is L, the CoG lies at L x W_r / W from the front axle.\n\nExample: front reads 120 g, rear reads 280 g, L = 100 mm. CoG is 100 x 280 / 400 = 70 mm behind the front axle, so 70% of the weight is on the rear pair. On a 4WD car that is quite rear-heavy: the front wheels carry little load and slip first, and the nose may lift on launch. Moving the battery forward towards an even split shares the grip between all four driven wheels. (On a 2WD car with a caster, the same method works with the caster on the front scale.)"
      },
      {
        heading: "Tipping in corners",
        body:
          "In a steady turn, the robot tips sideways when the lateral acceleration exceeds g x (b/2) / h, where b is track width and h is CoG height. It slides when lateral acceleration exceeds mu x g. If (b/2)/h > mu, the robot always slides before it tips, which is the safe design.\n\nExample: b = 120 mm, h = 40 mm: (b/2)/h = 1.5, so tipping needs 1.5 g. With mu = 0.8 the robot slides first. Raise the battery to h = 80 mm and the ratio becomes 0.75, below mu: now it can tip before sliding."
      },
      {
        heading: "Longitudinal weight transfer",
        body:
          "Under acceleration a, load shifts rearward by dW = m x a x h / L (L = wheelbase). Under braking, it shifts forward by the same amount. A high CoG and short wheelbase make the shift large: the robot may lift its front (sensors leave the track) on launch and pitch forward on hard braking. On a 4WD car the shift also unloads the front pair on launch, so those wheels spin first. Keep h small and L reasonable."
      }
    ],
    workingPrinciple:
      "Gravity acts on every part of the robot, but for motion and stability the sum behaves as one force through the CoG. The ground reaction forces at each wheel must balance this weight and any inertial forces from acceleration and cornering. When those inertial forces act through a high CoG, they create a moment that unloads one set of wheels; if the reaction at any wheel reaches zero, the robot lifts or tips. A low CoG keeps the moment small and the load on the drive wheels high.",
    diagrams: [
      {
        kind: "formula",
        latexish: "x_{cg} = \\frac{\\sum m_i x_i}{\\sum m_i};   a_{tip} = g \\frac{b/2}{h}",
        legend: { "m_i": "mass of component i", "x_i": "position of component i", b: "track width", h: "CoG height", "a_{tip}": "lateral acceleration that causes tipping" }
      },
      {
        kind: "circuit",
        nodes: [
          { id: "front", label: "Front pair: 120 g", x: 15, y: 60 },
          { id: "cg", label: "CoG (70 mm back)", x: 55, y: 30 },
          { id: "rear", label: "Rear pair: 280 g", x: 90, y: 60 }
        ],
        edges: [
          { from: "front", to: "cg", label: "70 mm" },
          { from: "cg", to: "rear", label: "30 mm" }
        ]
      }
    ],
    examples: [
      {
        title: "Re-positioning a battery",
        body: "A 2S LiPo pack sat on top of the Arduino, 50 mm above the track. The robot slid wide and occasionally rolled in the tightest corner. Moving it to a slot under the chassis plate (h = 15 mm for the battery) lowered the overall CoG from about 38 mm to about 24 mm. The tipping threshold rose from 1.6 g to 2.5 g, and because mu stayed at 0.8, the robot now always slides gently before it could tip."
      },
      {
        title: "Spreadsheet CoG calculator in code",
        body: "Enter each part's mass and position and let the Arduino (or any C++ compiler) compute the CoG. The same maths works in a spreadsheet.",
        code: `const int N = 4;
float massG[N] = {200, 150, 100, 30}; // chassis, battery, motors, sensor bar
float xMm[N]   = {60, 20, 100, 5};

void setup() {
  Serial.begin(9600);
  float sumM = 0, sumMx = 0;
  for (int i = 0; i < N; i++) {
    sumM += massG[i];
    sumMx += massG[i] * xMm[i];
  }
  Serial.print("CoG x (mm): ");
  Serial.println(sumMx / sumM);
}

void loop() {}`
      }
    ],
    commonMistakes: [
      { mistake: "Stacking boards and batteries vertically to save floor space.", why: "This raises h, lowering the tipping threshold g(b/2)/h and increasing weight transfer.", fix: "Spread components flat and put the heaviest (battery) lowest." },
      { mistake: "Putting most of the weight over one axle.", why: "On a 4WD car the lightly loaded pair then carries little normal force, so its wheels slip first and part of the available traction (mu x N) is wasted.", fix: "Place the battery low and between the axles so the front and rear pairs share the load." },
      { mistake: "Letting the front sensor bar lift under acceleration.", why: "A rearward CoG plus rear drive can lift the nose; sensors then read the wrong distance and lose the line.", fix: "Keep a little weight forward, ramp the launch, and check sensor height during a hard start." },
      { mistake: "Ignoring sideways CoG offset.", why: "If one side is heavier, that wheel grips more and the robot drifts in a straight line.", fix: "Balance the left and right masses and check with two scales side to side." }
    ],
    keyTakeaways: [
      "x_cg = sum(m_i x_i) / sum(m_i); the battery dominates.",
      "Measure CoG with two scales: position = L x W_rear / W_total from the front.",
      "Tipping needs lateral acceleration above g(b/2)/h; design so (b/2)/h > mu.",
      "Weight transfer m a h / L can lift sensors or unload drive wheels.",
      "Low and central, with the load shared between both driven axles, is the racing rule."
    ],
    relatedComponents: ["LiPo 2S Battery", "18650 Li-ion Cell", "Arduino Nano", "Silicone Robot Wheels", "QTR-8A"],
    youtubeSearch: "robot center of gravity stability weight distribution explained",
    quiz: [
      {
        type: "calculate",
        prompt: "A battery of 100 g sits at x = 0 mm and the rest of the robot (300 g) acts at x = 80 mm. Where is the overall centre of gravity?",
        options: ["20 mm", "40 mm", "80 mm", "60 mm"],
        answerIndex: 3,
        explanation: "x_cg = (100 x 0 + 300 x 80) / 400 = 24000 / 400 = 60 mm. 40 mm is the simple midpoint, which ignores that most of the mass is at 80 mm, and 20 mm puts the CoG on the wrong side of the midpoint.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Which change raises the cornering acceleration at which a race robot would tip over sideways?",
        options: [
          "Mounting the battery higher to free up chassis space",
          "Using a narrower chassis",
          "Lowering the battery and widening the track width",
          "Adding a taller sensor mast"
        ],
        answerIndex: 2,
        explanation: "Tipping occurs at a_tip = g x (b/2) / h. Lowering h and increasing b both raise a_tip. Mounting things higher or narrowing the chassis lowers it, which makes tipping easier.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt: "A rear-wheel-drive robot has its battery stacked high above the rear axle and a light sensor bar at the front. It launches at full power. What is most likely?",
        options: [
          "The front lifts (the robot pitches up), so the front line sensors rise off the track",
          "The front digs into the track and the rear wheels lift",
          "It accelerates perfectly with no change in attitude",
          "It turns sharply left"
        ],
        answerIndex: 0,
        explanation: "Acceleration transfers load rearward by m a h / L; with a high CoG near the rear axle, the front is unloaded and can lift. Sensors then read from the wrong height. Nose-diving happens under braking, not acceleration.",
        difficulty: 2
      },
      {
        type: "identify-component",
        prompt: "On a typical student race car, which component is usually the single heaviest item and therefore the most important to place low and near the drive axle?",
        options: ["TCRT5000 sensor", "Arduino Nano", "Li-ion / LiPo battery pack", "Jumper wires"],
        answerIndex: 2,
        explanation: "Battery packs are dense and typically the heaviest single part on a small robot, so their placement dominates the CoG. Sensors, a Nano and wires each weigh only a few grams.",
        difficulty: 1
      }
    ]
  }),

  // ---------------------------------------------------------------- 23
  defineTopic("race", 23, {
    slug: "track-navigation",
    title: "Track Navigation",
    minutes: 15,
    summary: "How a race robot knows where it is on the track: line sensors, wall sensing, start/finish markers, lap counting and state machines.",
    introduction:
      "A race robot must not only be fast; it must stay on the track. Depending on the event, the track may be marked by a line, bounded by walls, or both, with markers for start/finish and sometimes for special sections. Your club's rulebook decides which applies.\n\nThis topic covers estimating line position from a sensor array, wall following with distance sensors, detecting cross markers to count laps, and organising everything into a clear state machine so the robot always knows what it should be doing.",
    beginner:
      "Imagine driving at night on a road with painted lines. You constantly check where the lines are and steer to keep them in the right place. You also notice signs: a finish line, a sharp-bend warning. A race robot does exactly this with its sensors.\n\nIf the track has a line, a row of IR reflectance sensors under the front of the robot sees which sensors are over the dark line and which over the bright floor. From that pattern the robot works out whether the line is to its left, centre or right and steers to centre it.\n\nIf the track has walls, distance sensors on each side measure how far each wall is. If the left wall is closer than the right, steer right a little.\n\nMarkers are special patterns, like a thick line straight across the track. When every sensor in the array sees black at once, the robot knows it is crossing the start/finish line and can count a lap.\n\nTo keep all this organised, programmers use a state machine: the robot is always in exactly one state, such as WAITING, RACING or FINISHED, and simple rules move it between states. This stops the code from becoming a tangle of if statements.",
    technical: [
      {
        heading: "Line position from an array",
        body:
          "Give each sensor a weight by position, e.g. -2, -1, 0, +1, +2 for five sensors (or 0, 1000, ..., 7000 for an 8-sensor QTR array). The line position is the weighted average:\n\nposition = sum(s_i x w_i) / sum(s_i)\n\nwhere s_i is the sensor reading (0/1 for digital, or a calibrated 0-1000 analog value). Analog readings give a smooth, high-resolution position, which makes PID control much better than with on/off sensors.\n\nIf no sensor sees the line (sum = 0), you have lost it: keep turning in the direction the line was last seen rather than dividing by zero."
      },
      {
        heading: "Wall following",
        body:
          "With a distance sensor on each side, the centring error is e = dLeft - dRight. If the robot drifts right, dRight shrinks and e becomes positive; the correct response is to steer left. With mixing left = base - turn, right = base + turn (positive turn = left), turn = Kp x e.\n\nHC-SR04 ultrasonic sensors measure about 2-400 cm but each reading takes time (the echo must return) and two sensors fired at once can hear each other's pulses, so trigger them alternately. Sharp IR analog sensors are faster to read but non-linear and must be calibrated."
      },
      {
        heading: "Markers and lap counting",
        body:
          "A start/finish cross line appears as 'all sensors black'. Detect the rising edge of this condition (not-all-black to all-black) and count once; then require the condition to clear (e.g. at most two sensors black) before counting again. This latch prevents counting dozens of laps while the robot rolls across a thick line.\n\nAlternatively, use encoder distance: ignore markers until the robot has travelled at least, say, 80% of the known lap length since the last count."
      },
      {
        heading: "State machines",
        body:
          "Typical states: WAIT_START (motors off, wait for start button and any start delay required by the rules), RACE (line or wall following), LOST_LINE (search towards the last known side), FINISH (stop after the required laps).\n\nImplement with an enum and a switch in loop(). Each state does its own small job and decides the next state. Avoid delay() so sensors are read every loop."
      }
    ],
    workingPrinciple:
      "The robot repeatedly senses its position relative to track features (line position from reflectance sensors, wall distances from range sensors), computes an error from where it should be, and corrects its steering. In parallel, it watches for discrete events (markers, lost line, lap count) and switches its behaviour using a state machine, so each part of the lap is handled by the appropriate rule.",
    diagrams: [
      { kind: "pinout", componentId: "qtr-8a", highlight: ["1", "8", "VCC", "GND"] },
      {
        kind: "flow",
        steps: ["WAIT_START: motors off until start button (and any required delay)", "RACE: read sensors, compute position, PID steer", "All sensors black and latch clear -> lap++", "No sensor sees line -> LOST_LINE: turn toward last seen side", "laps == target -> FINISH: brake and stop"]
      }
    ],
    examples: [
      {
        title: "Lap counter with a latch",
        body: "Five analog sensors on A0-A4. With this wiring, black gives a higher reading than white; THRESH is set halfway between calibrated black and white values.",
        code: `const byte S[5] = {A0, A1, A2, A3, A4};
const int THRESH = 500;
int laps = 0;
bool onMarker = false;

int countBlack() {
  int n = 0;
  for (byte i = 0; i < 5; i++) {
    if (analogRead(S[i]) > THRESH) n++;
  }
  return n;
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  int blackCount = countBlack();
  if (blackCount == 5 && !onMarker) {
    onMarker = true;
    laps++;
    Serial.print("Lap ");
    Serial.println(laps);
  }
  if (blackCount <= 2) onMarker = false;
}`
      },
      {
        title: "State machine skeleton",
        body: "An enum-based state machine for a 3-lap race with a start button on pin 12 (wired to GND, using INPUT_PULLUP).",
        code: `enum State { WAIT_START, RACE, LOST_LINE, FINISH };
State state = WAIT_START;
int laps = 0;
const int TARGET_LAPS = 3;

void setMotors(int l, int r) { /* driver code */ }
bool lineVisible() { return true; } // replace with sensor check
bool crossMarker() { return false; } // replace with latched marker check
void followLine() { /* PID line following */ }

void setup() {
  pinMode(12, INPUT_PULLUP);
}

void loop() {
  switch (state) {
    case WAIT_START:
      setMotors(0, 0);
      if (digitalRead(12) == LOW) state = RACE;
      break;
    case RACE:
      followLine();
      if (crossMarker()) laps++;
      if (laps >= TARGET_LAPS) state = FINISH;
      else if (!lineVisible()) state = LOST_LINE;
      break;
    case LOST_LINE:
      setMotors(-80, 80); // search toward last seen side
      if (lineVisible()) state = RACE;
      break;
    case FINISH:
      setMotors(0, 0);
      break;
  }
}`
      }
    ],
    commonMistakes: [
      { mistake: "Counting a lap every loop while sensors are over the finish line.", why: "The loop runs thousands of times while crossing a thick marker, so laps jumps by hundreds.", fix: "Count only on the transition into the marker and re-arm when it clears." },
      { mistake: "Dividing by zero when the line is lost.", why: "The weighted average divides by sum(s_i), which is 0 with no line visible.", fix: "Check for sum == 0 first and use the last known position or a search state." },
      { mistake: "Wrong sign in the wall-following correction.", why: "With the sign flipped, the robot steers towards the closer wall and crashes.", fix: "Test by placing the robot near one wall and checking which way it steers at low speed." },
      { mistake: "Firing two ultrasonic sensors at the same moment.", why: "Each can hear the other's echo, giving false distances.", fix: "Trigger them alternately and wait for each echo (or its timeout) before the next." }
    ],
    keyTakeaways: [
      "Line position = weighted average of sensor readings; analog readings give smoother control.",
      "Wall following uses e = dLeft - dRight with a carefully checked sign.",
      "Detect markers on the edge (transition), not the level, to count laps once.",
      "A state machine keeps start, race, recovery and finish logic clean.",
      "Always handle the 'line lost' case explicitly."
    ],
    relatedComponents: ["QTR-8A", "TCRT5000", "HC-SR04", "Sharp GP2Y0A21YK0F", "Arduino Uno R3"],
    youtubeSearch: "line follower lap counter state machine Arduino race robot",
    quiz: [
      {
        type: "identify-component",
        prompt: "Which sensor is a single board carrying eight IR emitter/phototransistor pairs in a row with analog outputs, used to estimate the position of a line?",
        diagram: { kind: "pinout", componentId: "qtr-8a" },
        options: ["QTR-8A reflectance sensor array", "HC-SR04 ultrasonic sensor", "Sharp IR distance sensor", "Rotary encoder"],
        answerIndex: 0,
        explanation: "The QTR-8A has eight reflectance sensor pairs with analog outputs, ideal for weighted-average line position. The HC-SR04 and Sharp IR sensors measure distance to objects (for example walls), and an encoder measures wheel rotation.",
        difficulty: 1
      },
      {
        type: "code-output",
        prompt: "What does this weighted-average sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int s[5] = {0, 0, 1, 1, 0};
  int w[5] = {-2, -1, 0, 1, 2};
  int sum = 0, n = 0;
  for (int i = 0; i < 5; i++) {
    sum += s[i] * w[i];
    n += s[i];
  }
  Serial.println(sum * 100 / n);
}

void loop() {}`,
        options: ["100", "1", "0", "50"],
        answerIndex: 3,
        explanation: "sum = 0 x 0 + 1 x 1 = 1 (from sensors with weights 0 and +1), n = 2. sum x 100 / n = 100 / 2 = 50, so the line is half-way between the centre and the right-of-centre sensor. Printing 1 would forget the x100 and /n; 100 forgets dividing by n.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt: "A wall-following robot computes error = dLeft - dRight, turn = Kp * error, then calls setMotors(base + turn, base - turn). It starts close to the RIGHT wall. What does it do?",
        options: [
          "Moves back to the centre of the lane",
          "Drives straight, ignoring the walls",
          "Steers further towards the right wall and hits it",
          "Spins on the spot"
        ],
        answerIndex: 2,
        explanation: "Near the right wall, dRight is small so error is positive and turn is positive. Left motor = base + turn (faster), right = base - turn (slower), so the robot turns right, towards the wall. The sign is inverted; it should be setMotors(base - turn, base + turn) to steer left, away from the wall.",
        difficulty: 3
      },
      {
        type: "debug-code",
        prompt: "This lap counter reports hundreds of laps after the robot crosses the finish line once. What is the fix?",
        code: `const byte S[5] = {A0, A1, A2, A3, A4};
int laps = 0;

int countBlack() {
  int n = 0;
  for (byte i = 0; i < 5; i++) {
    if (analogRead(S[i]) > 500) n++;
  }
  return n;
}

void setup() { Serial.begin(9600); }

void loop() {
  if (countBlack() == 5) laps++;
  Serial.println(laps);
}`,
        options: [
          "Lower the threshold from 500 to 100",
          "Add a latch so a lap is counted only on the transition into the marker, re-armed once it clears",
          "Change laps to a long",
          "Add delay(10) at the end of loop()"
        ],
        answerIndex: 1,
        explanation: "loop() runs many times while the sensors are over the marker, and each pass adds a lap. A boolean latch (count when entering, re-arm when fewer sensors see black) counts exactly once. A small delay only reduces the overcount, and a long just allows a bigger wrong number.",
        difficulty: 2
      }
    ]
  })
];
