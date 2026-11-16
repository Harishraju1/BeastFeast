import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_07: Topic[] = [
  defineTopic("line", 7, {
    slug: "capacitors",
    title: "Capacitors",
    minutes: 10,
    summary: "Capacitors store charge, smooth supply voltages, absorb motor noise and create RC timing — and electrolytic ones must be connected the right way round.",
    introduction: `Motors are electrically noisy. Every time the brushes inside a DC motor switch between windings they create sparks and voltage spikes, and every time a motor starts it pulls a sudden gulp of current from the battery. Capacitors are the components that soak up these disturbances so your Arduino and sensors keep working.

This topic covers how capacitors work, how to read their markings, and where to place them on a robot.`,
    beginner: `A capacitor is like a small water tank connected to the pipes of your water system. When the pressure (voltage) is steady, the tank just sits there full. But if somebody suddenly opens a big tap elsewhere — a motor starting — the pressure would normally dip. The tank instantly releases some of its stored water and covers the gap, so the pressure stays steady. When the pressure spikes up, the tank absorbs the excess.

Capacitors store electric charge on two metal plates separated by a thin insulator. They charge up when voltage is applied and release that charge when the voltage drops. They cannot store much energy compared with a battery, but they can deliver or absorb it extremely quickly, which is exactly what you need to smooth out fast spikes and dips.

On a robot you will typically see small ceramic capacitors (often 100 nF) placed right next to chips and across motor terminals to kill high-frequency noise, and larger electrolytic capacitors (tens to hundreds of microfarads) near the motor driver's power input to supply sudden current demands.

One warning: electrolytic capacitors have a positive and a negative leg. Connect them backwards and they can overheat, bulge or even burst. Always look for the stripe marking the negative leg.`,
    technical: [
      {
        heading: "Capacitance, charge and energy",
        body: `Q = C × V: a capacitor of C farads holds Q coulombs at V volts. Practical units are µF (10⁻⁶ F), nF (10⁻⁹ F) and pF (10⁻¹² F).

Current into a capacitor: I = C × dV/dt. A 470 µF capacitor asked to supply 1 A for 1 ms sags by dV = I × dt / C = 1 × 0.001 / 0.000470 ≈ 2.1 V. That shows bulk capacitors help with short spikes but cannot replace a battery.

Stored energy: E = ½ C V². 470 µF at 8.4 V stores about 0.017 J.`,
      },
      {
        heading: "RC time constant",
        body: `Charging through a resistor R, a capacitor's voltage follows V(t) = V_s × (1 − e^(−t/RC)). The time constant τ = R × C. After 1τ it reaches about 63% of the supply; after about 5τ it is effectively fully charged (over 99%).

Example: R = 10 kΩ, C = 100 µF → τ = 10 000 × 0.0001 = 1 s. RC filters are used to smooth noisy sensor signals and debounce buttons. A low-pass RC filter has a cut-off frequency f_c = 1 / (2πRC).`,
      },
      {
        heading: "Types and markings",
        body: `- Ceramic: small, non-polarised, values from pF to a few µF; ideal for decoupling and motor noise suppression. A 3-digit code gives the value in pF: '104' = 10 × 10⁴ pF = 100 000 pF = 100 nF = 0.1 µF. '103' = 10 nF.
- Electrolytic (aluminium): larger values (1 µF to thousands of µF), polarised. The stripe on the can marks the negative lead; the longer lead is positive. Voltage rating printed on the can — choose at least 1.5–2× your supply voltage.
- Tantalum: compact, polarised, can fail short if reverse-biased or over-volted.`,
      },
      {
        heading: "Decoupling and motor noise suppression",
        body: `- Place a 100 nF ceramic as close as possible between VCC and GND of every IC (Arduino boards already include them).
- Solder a 100 nF ceramic directly across each DC motor's terminals; optionally add one from each terminal to the motor case. This shunts brush noise before it travels along the wires.
- Add a bulk electrolytic (e.g. 100–470 µF) across the motor driver supply input, observing polarity, to supply current surges and reduce battery sag at start-up.`,
      },
    ],
    workingPrinciple: `A capacitor consists of two conductors separated by an insulator (dielectric). When a voltage is applied, charge accumulates on the plates — positive on one, negative on the other — creating an electric field that stores energy. Because the voltage across a capacitor cannot change instantly (dV/dt = I/C), it resists sudden voltage changes: it supplies current when the rail dips and absorbs current when the rail spikes, smoothing the supply. Through a resistor it charges with a predictable exponential curve, which is the basis of RC timing and filtering.`,
    diagrams: [
      {
        kind: "signal",
        title: "RC charging curve (τ = RC)",
        xLabel: "Time (multiples of τ)",
        yLabel: "Capacitor voltage (% of supply)",
        series: [{ label: "V_C", points: [[0, 0], [0.5, 39], [1, 63], [2, 86], [3, 95], [4, 98], [5, 99]] }],
      },
      { kind: "formula", latexish: "τ = R × C ;  Q = C × V ;  I = C × dV/dt", legend: { τ: "time constant in seconds", R: "resistance (Ω)", C: "capacitance (F)", Q: "charge (C)", V: "voltage (V)" } },
    ],
    examples: [
      {
        title: "Fixing random Arduino resets",
        body: "Symptom: the robot resets whenever the motors reverse direction.\n\n1. Solder 100 nF ceramic capacitors across each motor's terminals.\n2. Add a 220 µF (16 V or higher) electrolytic across the motor driver's supply input — stripe to GND.\n3. Twist the motor wires together to reduce radiated noise.\n\nThe capacitors absorb brush noise and supply the inrush current so the battery voltage does not dip below what the Arduino's regulator needs.",
      },
      {
        title: "Software view of an RC-filtered sensor",
        body: "An RC low-pass filter can also be imitated in code with an exponential moving average. This smooths a noisy analog reading just like a capacitor smooths voltage.",
        code: `float filtered = 0;
const float ALPHA = 0.2; // smaller = smoother but slower

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  filtered = filtered + ALPHA * (raw - filtered); // like an RC charging step
  Serial.println(filtered);
  delay(10);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Inserting an electrolytic capacitor backwards.", why: "Reverse voltage damages the oxide layer; the capacitor heats, bulges and can vent.", fix: "Connect the striped (negative) lead to the lower voltage / GND side." },
      { mistake: "Choosing a capacitor with too low a voltage rating.", why: "A 6.3 V capacitor on an 8.4 V battery rail is over-stressed and will fail.", fix: "Pick a voltage rating at least 1.5–2× the highest rail voltage (e.g. 16 V or 25 V for a 2S pack)." },
      { mistake: "Placing decoupling capacitors far from the chip or motor.", why: "Long wires add inductance, so high-frequency noise bypasses the capacitor.", fix: "Mount ceramics directly at the IC pins or motor terminals." },
      { mistake: "Expecting a capacitor to replace a weak battery.", why: "Capacitors store little energy; they only bridge very short dips.", fix: "Fix the underlying supply (healthy battery, thick wires) and use capacitors for transients." },
    ],
    keyTakeaways: [
      "Capacitors store charge (Q = C × V) and resist sudden voltage changes.",
      "τ = RC: about 63% charged after one time constant, nearly full after five.",
      "'104' on a ceramic means 100 nF (0.1 µF).",
      "Electrolytics are polarised — stripe = negative — and need a sufficient voltage rating.",
      "Use 100 nF across motors and near ICs, plus bulk capacitance at the driver input.",
    ],
    relatedComponents: ["Ceramic Capacitor", "Electrolytic Capacitor", "L298N", "TT Yellow Gear Motor"],
    youtubeSearch: "capacitors explained decoupling motor noise suppression robot",
    quiz: [
      {
        type: "identify-component",
        prompt: "A small yellow ceramic capacitor is marked '104'. What is its value?",
        options: ["104 pF", "10 nF", "104 µF", "100 nF (0.1 µF)"],
        answerIndex: 3,
        explanation: "The code is two digits then a multiplier: 10 × 10⁴ pF = 100 000 pF = 100 nF = 0.1 µF. Reading it as 104 pF ignores the multiplier digit.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A 10 kΩ resistor charges a 100 µF capacitor. What is the RC time constant?",
        options: ["1 s", "0.1 s", "10 s", "1 ms"],
        answerIndex: 0,
        explanation: "τ = R × C = 10 000 Ω × 0.0001 F = 1 s. Writing 100 µF as 0.001 F (an extra factor of 10) gives 10 s — remember 1 µF = 0.000001 F.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt: "A 220 µF, 16 V electrolytic capacitor is soldered across a robot's 7.4 V supply with its striped lead on the positive rail. What is the most likely outcome?",
        options: ["It works normally because capacitors are not polarised", "It works better than the correct orientation", "It heats up, may bulge or vent, and can fail short", "It instantly reduces the supply to 0 V and nothing gets hot"],
        answerIndex: 2,
        explanation: "The stripe marks the negative lead, so this capacitor is reverse-biased. Electrolytics break down when reversed, leak current, heat up and can vent or short. Only ceramic and film capacitors are non-polarised.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Why do robot builders solder a 100 nF ceramic capacitor directly across each DC motor's terminals?",
        options: ["To increase the motor's top speed", "To suppress high-frequency electrical noise produced by the motor's brushes", "To store energy so the motor runs after the battery is removed", "To reverse the motor direction"],
        answerIndex: 1,
        explanation: "Brushed motors spark as the commutator switches windings, producing high-frequency noise; a ceramic capacitor right at the terminals shunts it. A 100 nF capacitor stores a negligible amount of energy, so it cannot keep the motor running.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 8, {
    slug: "diodes",
    title: "Diodes",
    minutes: 10,
    summary: "Diodes let current flow one way only; robots use them for reverse-polarity protection, flyback suppression across motors and coils, and as LEDs.",
    introduction: `Diodes are one-way valves for electric current. They protect your robot when somebody plugs the battery in backwards, they absorb the voltage spikes from motors and relays, and in the form of LEDs and IR emitters they give your robot status lights and line sensors.

This topic explains forward voltage, polarity markings, the common diode types and where each is used.`,
    beginner: `A diode works like a one-way door or a non-return valve in a pipe. Water can flow freely in one direction, but if it tries to flow backwards, the valve slams shut. Electric current through a diode behaves the same way: it flows from the anode to the cathode, but not the other way.

There is a small catch. To push the door open in the allowed direction you need a little bit of force first. For an ordinary silicon diode this is about 0.7 V. So a diode always 'costs' you a small amount of voltage when it conducts.

Diodes are marked with a stripe or band at one end — that is the cathode, the end current flows out of. On schematics the symbol is an arrow (triangle) pointing at a bar, which shows the allowed direction.

Robots use diodes in several clever ways. A diode in series with the battery stops current flowing if someone connects the battery backwards, saving your Arduino. A diode placed across a motor or relay coil absorbs the voltage spike created when the coil is switched off. And an LED is simply a diode that gives off light when current flows through it; the IR LED inside a TCRT5000 line sensor is one of these.`,
    technical: [
      {
        heading: "Forward voltage and the I–V curve",
        body: `A diode barely conducts until the forward voltage V_f is reached, then current rises very steeply. Typical values:

- Silicon rectifier (1N4007) and signal diode (1N4148): about 0.6–0.7 V.
- Schottky (1N5819): lower, roughly 0.2–0.45 V depending on current — less wasted power.
- LEDs: higher, depending on colour — red about 1.8–2.2 V, blue/white roughly 3 V.

Because the curve is so steep, you must limit diode/LED current with a resistor (or a current-limited source) — the diode itself will not.`,
      },
      {
        heading: "Reverse-polarity protection",
        body: `A series diode in the battery positive line blocks current if the battery is reversed. Cost: the diode drops V_f all the time and dissipates P = V_f × I. With a 1N4007 (about 0.7 V) and 1 A of motor current, that is 0.7 W of heat and 0.7 V lost: a 7.4 V pack delivers about 6.7 V. A Schottky diode loses less. (A P-channel MOSFET circuit is even more efficient but more complex.)

Check the diode's current rating: 1N4007 and 1N5819 are both 1 A parts, so they are only suitable for small robots.`,
      },
      {
        heading: "Flyback (freewheeling) diodes",
        body: `Inductors (motor windings, relay coils) resist sudden changes in current: V = L × dI/dt. When a transistor switches off an inductive load, the current has nowhere to go and the voltage spikes far above the supply, which can destroy the transistor.

A flyback diode is connected across the load, reverse-biased in normal operation: cathode to the positive supply side, anode to the transistor side. At switch-off, the coil's current circulates through the diode and decays safely. H-bridge drivers need four such diodes; the L298N requires external ones (many modules include them on the board), while MOSFET drivers like the TB6612FNG and DRV8833 handle this internally.`,
      },
    ],
    workingPrinciple: `A diode is a junction between P-type and N-type semiconductor. Under forward bias (anode more positive than cathode by about V_f) the junction's depletion region collapses and current flows easily. Under reverse bias the depletion region widens and only a tiny leakage current flows, until the reverse breakdown voltage is exceeded. LEDs are diodes made from semiconductors that release recombination energy as light; IR LEDs emit at near-infrared wavelengths such as 940–950 nm.`,
    diagrams: [
      {
        kind: "signal",
        title: "Typical silicon diode I–V curve (forward region)",
        xLabel: "Forward voltage (V)",
        yLabel: "Current (mA)",
        series: [{ label: "Silicon diode", points: [[0, 0], [0.3, 0], [0.5, 1], [0.6, 5], [0.65, 15], [0.7, 50], [0.75, 150]] }],
      },
      {
        kind: "circuit",
        nodes: [
          { id: "vplus", label: "+V supply", x: 60, y: 40 },
          { id: "coil", label: "Relay coil / motor", x: 260, y: 40 },
          { id: "diode", label: "Flyback diode (cathode to +V)", x: 260, y: 160 },
          { id: "q", label: "NPN / MOSFET switch", x: 460, y: 100 },
          { id: "gnd", label: "GND", x: 460, y: 240 },
        ],
        edges: [
          { from: "vplus", to: "coil" },
          { from: "coil", to: "q" },
          { from: "diode", to: "vplus", label: "cathode" },
          { from: "diode", to: "q", label: "anode" },
          { from: "q", to: "gnd" },
        ],
      },
    ],
    examples: [
      {
        title: "Reverse-polarity protection on a 2S pack",
        body: "Place a 1N5819 Schottky diode in series with the battery positive lead feeding the Arduino Vin (low current, so the 1 A rating is plenty). Stripe (cathode) toward the Arduino. Measured result: about 7.1 V at Vin from a 7.4 V pack, instead of 6.7 V with a 1N4007. For the motor supply, which may carry several amps, use a properly rated part or a MOSFET-based protection circuit.",
      },
      {
        title: "Testing a diode or LED with a multimeter",
        body: "Set the meter to diode test. Red probe on the anode, black on the cathode: a silicon diode reads roughly 0.5–0.7 (volts), an LED often glows faintly and reads higher. Reverse the probes: the meter shows 'OL' (open). If it reads near zero both ways, the diode is shorted; if 'OL' both ways, it is open.",
      },
    ],
    commonMistakes: [
      { mistake: "Inserting a diode or LED backwards.", why: "Reverse-biased, it blocks current, so the circuit is dead (or, for a flyback diode, the supply is shorted).", fix: "Match the stripe (cathode) to the bar in the schematic symbol; LED's short leg / flat side is the cathode." },
      { mistake: "Driving an LED without a series resistor.", why: "The steep I–V curve means a little extra voltage causes a huge current that destroys the LED or the pin.", fix: "Always add a resistor: R = (V_supply − V_f) / I." },
      { mistake: "Omitting flyback diodes when switching motors or relays with a transistor.", why: "The inductive spike at switch-off can exceed the transistor's voltage rating.", fix: "Place a diode across the coil, cathode to the positive supply, or use a driver with built-in protection." },
      { mistake: "Using a 1 A diode for reverse protection on a high-current motor supply.", why: "Stall currents can exceed the rating, overheating the diode.", fix: "Size diodes for the worst-case current, or use a MOSFET reverse-polarity circuit." },
    ],
    keyTakeaways: [
      "Diodes conduct anode → cathode only; the stripe marks the cathode.",
      "Silicon diodes drop about 0.7 V; Schottky diodes drop less.",
      "LEDs are diodes that emit light and always need a current-limiting resistor.",
      "Flyback diodes protect switches from inductive spikes from motors and relays.",
      "A series diode gives simple reverse-polarity protection at the cost of a voltage drop.",
    ],
    relatedComponents: ["1N4007 Diode", "Schottky Diode", "1N4148 Diode", "LED Diode", "L298N"],
    youtubeSearch: "diode explained flyback diode reverse polarity protection",
    quiz: [
      {
        type: "predict-circuit",
        prompt: "An LED and a 220 Ω resistor are connected from Arduino pin 13 to GND. The LED's long leg goes to GND and its short leg to the resistor. The pin is set HIGH. What happens?",
        options: ["The LED glows brightly", "The LED stays off because it is reverse-biased", "The LED burns out instantly", "The LED flickers"],
        answerIndex: 1,
        explanation: "The long leg is the anode; here it is connected to GND, so the LED is reverse-biased and blocks current — it stays off. It does not burn out, because almost no current flows (though you should still avoid reverse-biasing LEDs, as their reverse voltage rating is low).",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "A relay coil is switched by an NPN transistor (coil between +5 V and the collector). A flyback diode is fitted with its ANODE on +5 V and its CATHODE on the collector. As soon as the transistor turns on, the transistor and diode get very hot. What is wrong?",
        options: ["The diode is reversed: it is forward-biased and shorts the supply when the transistor turns on", "A flyback diode should be in series with the coil", "The relay needs an electrolytic capacitor instead", "The transistor should be a PNP"],
        answerIndex: 0,
        explanation: "With anode on +5 V and cathode on the collector, turning the transistor on pulls the cathode near 0 V, forward-biasing the diode and creating a near-short from +5 V through the diode and transistor. The cathode must go to +5 V. Putting the diode in series would block the coil current entirely.",
        difficulty: 3,
      },
      {
        type: "identify-component",
        prompt: "You need a reverse-polarity protection diode for the Arduino's Vin line that wastes as little voltage as possible. Which part is the best choice?",
        options: ["1N4148 small-signal diode", "Red LED", "1N4007 rectifier diode", "1N5819 Schottky diode"],
        answerIndex: 3,
        explanation: "A Schottky diode such as the 1N5819 has a lower forward drop than a silicon rectifier, so less voltage is lost. A 1N4007 works but drops about 0.7 V; the 1N4148 is a small-signal diode with a low current rating.",
        difficulty: 2,
      },
      {
        type: "calculate",
        prompt: "A 1N4007 diode (forward drop about 0.7 V) is placed in series with a 7.4 V battery for reverse-polarity protection. The robot draws 1 A. How much power does the diode dissipate?",
        options: ["7.4 W", "0.07 W", "0.7 W", "6.7 W"],
        answerIndex: 2,
        explanation: "P = V_f × I = 0.7 V × 1 A = 0.7 W — enough to make the diode noticeably hot. 7.4 W would be the whole robot's power, not the diode's loss; 6.7 is the voltage left for the robot, not a power.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 9, {
    slug: "transistors",
    title: "Transistors",
    minutes: 12,
    summary: "Transistors let a tiny control signal switch a much larger current; BJTs are current-controlled, MOSFETs voltage-controlled, and both sit inside every motor driver.",
    introduction: `A transistor is an electrically controlled switch (or amplifier). It is the reason an Arduino pin that can only give 20 mA can control a motor drawing amps. Every motor driver — L298N, TB6612FNG, DRV8833 — is made of transistors arranged as H-bridges.

In this topic you will learn the two main families (BJT and MOSFET), how to calculate a base resistor, why 'logic-level' matters for MOSFETs, and how to build a simple one-direction motor switch.`,
    beginner: `Imagine a huge water pipe with a valve that is very heavy to turn by hand. Now imagine the valve has a small lever attached, so a gentle push with one finger opens the big valve fully. A transistor is that lever-operated valve for electricity: a small signal on one terminal controls a much larger current flowing through the other two.

There are two common kinds. A bipolar junction transistor (BJT), such as the BC547, is controlled by a small current flowing into its 'base' pin. The larger current flows from the 'collector' to the 'emitter'. A MOSFET, such as the IRLZ44N, is controlled by the voltage on its 'gate' pin; it barely takes any current to hold it on. The large current flows from 'drain' to 'source'.

For robots, transistors are mostly used as switches: fully on or fully off. An Arduino pin goes HIGH, the transistor turns on, and the motor, LED strip or buzzer connected to it runs from the battery. Because the transistor sits on the ground side of the load, this is called a 'low-side switch'.

One transistor can switch a motor in one direction only. To go forward and backward you need four transistors arranged in an H-bridge — which is exactly what a motor driver board contains.`,
    technical: [
      {
        heading: "BJT as a switch",
        body: `NPN BJT: current into the base (I_B) allows a collector current I_C up to about β × I_B (β, also called h_FE, varies widely between parts — often 100 or more for small-signal transistors). In saturation (fully on) V_CE(sat) is typically around 0.2 V and V_BE is about 0.7 V.

Base resistor design (worked example): switch a 100 mA load with an assumed β of 100.
- Minimum I_B = 100 mA / 100 = 1 mA. Over-drive about 5× for solid saturation → 5 mA.
- R_B = (5 V − 0.7 V) / 0.005 A = 860 Ω → use 820 Ω or 1 kΩ (1 kΩ gives about 4.3 mA, still plenty).
- The Arduino pin supplies only ~4–5 mA — well under 20 mA.

Note: the popular BC547 is rated for 100 mA collector current, so it is fine for LEDs and buzzers but not for gear motors.`,
      },
      {
        heading: "MOSFET as a switch",
        body: `An N-channel MOSFET turns on when the gate–source voltage V_GS exceeds the threshold V_GS(th). Important: the threshold is where it starts conducting, not where it is fully on. Its on-resistance R_DS(on) is specified at a particular V_GS.

- IRF540N: V_GS(th) about 2–4 V, R_DS(on) specified at V_GS = 10 V. Driven from a 5 V Arduino pin it may be only partly on, getting hot.
- Logic-level MOSFETs (e.g. IRLZ44N) have R_DS(on) specified at 4–5 V gate drive, so they switch fully from 5 V logic.

Conduction loss: P = I² × R_DS(on). A MOSFET with 0.03 Ω carrying 2 A dissipates 0.12 W; a BJT with 0.2 V V_CE(sat) at 2 A would dissipate 0.4 W. Add a gate resistor (e.g. 100–220 Ω) and a pull-down (e.g. 10 kΩ gate to source) so the MOSFET is off while the Arduino boots.`,
      },
      {
        heading: "From one transistor to an H-bridge",
        body: `A single low-side switch with a flyback diode can run a motor in one direction with PWM speed control — enough for a fan or a spinner. Four switches in an 'H' let you apply the battery either way across the motor (forward/reverse) and also short the motor terminals for braking.

- L298N: bipolar transistor H-bridges → significant voltage drop (around 2 V at 1 A) and heat.
- TB6612FNG and DRV8833: MOSFET H-bridges → much lower drop and higher efficiency at similar currents.`,
      },
    ],
    workingPrinciple: `In a BJT, a small base current injects carriers into the thin base region, allowing a proportionally larger collector current to flow; drive enough base current and the transistor saturates and behaves like a closed switch. In a MOSFET, voltage on the insulated gate creates an electric field that forms a conductive channel between drain and source; once the gate voltage is well above threshold, the channel's resistance becomes very low. Either way, a low-power signal controls a high-power path.`,
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "pin", label: "Arduino pin", x: 40, y: 160 },
          { id: "rb", label: "R_B 1 kΩ", x: 180, y: 160 },
          { id: "q", label: "NPN (BC547)", x: 340, y: 160 },
          { id: "load", label: "Load (LED + resistor / buzzer)", x: 340, y: 40 },
          { id: "vcc", label: "+5 V", x: 520, y: 40 },
          { id: "gnd", label: "GND", x: 340, y: 280 },
        ],
        edges: [
          { from: "pin", to: "rb" },
          { from: "rb", to: "q", label: "base" },
          { from: "vcc", to: "load" },
          { from: "load", to: "q", label: "collector" },
          { from: "q", to: "gnd", label: "emitter" },
        ],
      },
      { kind: "formula", latexish: "R_B = (V_pin − V_BE) / I_B ;  I_B ≥ I_C / β", legend: { V_pin: "Arduino HIGH voltage (≈5 V)", V_BE: "base-emitter drop (≈0.7 V)", I_B: "base current", I_C: "load current", β: "current gain (h_FE)" } },
    ],
    examples: [
      {
        title: "PWM fan or spinner with a logic-level MOSFET",
        body: "IRLZ44N gate to pin 9 through 220 Ω, 10 kΩ from gate to GND, source to GND, motor between battery + and drain, flyback diode across the motor (cathode to battery +). Common ground between battery and Arduino.",
        code: `const int MOSFET_GATE = 9; // PWM pin

void setup() {
  pinMode(MOSFET_GATE, OUTPUT);
}

void loop() {
  for (int duty = 0; duty <= 255; duty += 5) { // ramp up
    analogWrite(MOSFET_GATE, duty);
    delay(20);
  }
  delay(1000);
  analogWrite(MOSFET_GATE, 0);                  // stop
  delay(1000);
}`,
      },
      {
        title: "Switching a bright status LED strip with a BC547",
        body: "A 12-LED indicator needs 80 mA — too much for a pin. With β assumed 100, I_B(min) = 0.8 mA; a 1 kΩ base resistor gives (5 − 0.7)/1000 ≈ 4.3 mA, over 5× the minimum, so the transistor saturates. The load stays under the BC547's 100 mA rating.",
      },
    ],
    commonMistakes: [
      { mistake: "Connecting the base directly to an Arduino pin without a resistor.", why: "The base-emitter junction is a diode; without a resistor it draws excessive current, damaging the pin and the transistor.", fix: "Always use a base resistor sized with R_B = (5 − 0.7) / I_B." },
      { mistake: "Using a standard MOSFET such as IRF540N directly from 5 V logic.", why: "Its R_DS(on) is specified at 10 V gate drive; at 5 V it may be only partly on and overheat.", fix: "Use a logic-level MOSFET (e.g. IRLZ44N) or a gate driver." },
      { mistake: "Forgetting the flyback diode on a motor switched by a single transistor.", why: "The inductive spike at switch-off can destroy the transistor.", fix: "Put a diode across the motor, cathode to the positive supply." },
      { mistake: "Trying to reverse a motor with one transistor.", why: "A single switch can only connect or disconnect one polarity.", fix: "Use an H-bridge driver (L298N, TB6612FNG, DRV8833) for bidirectional control." },
    ],
    keyTakeaways: [
      "Transistors let a small signal switch a large current.",
      "BJTs are current-controlled: size the base resistor for saturation.",
      "MOSFETs are voltage-controlled: use logic-level parts with 5 V Arduino pins.",
      "Inductive loads need flyback diodes when switched by transistors.",
      "An H-bridge is four transistor switches — the core of every motor driver.",
    ],
    relatedComponents: ["BC547", "IRLZ44N", "IRF540N", "TB6612FNG", "L298N"],
    youtubeSearch: "transistor as a switch arduino mosfet logic level motor",
    quiz: [
      {
        type: "identify-component",
        prompt: "You want an Arduino Uno pin (5 V) to fully switch a 3 A spinner motor with minimal heating. Which transistor is the best choice?",
        options: ["BC547 NPN transistor", "IRF540N standard MOSFET", "IRLZ44N logic-level MOSFET", "1N4007 diode"],
        answerIndex: 2,
        explanation: "The IRLZ44N is a logic-level MOSFET whose on-resistance is specified at 4–5 V gate drive, so a 5 V pin turns it fully on. The IRF540N is a strong MOSFET but its R_DS(on) is specified at 10 V gate drive, so at 5 V it may be only partly on. The BC547 is limited to 100 mA.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt: "An NPN transistor has its base connected to Arduino pin 8 through 1 kΩ, emitter to GND, and an LED with resistor from +5 V to the collector. The code sets pin 8 LOW. What does the LED do?",
        options: ["It is off, because no base current flows so the transistor is off", "It is on, because the transistor inverts the signal", "It glows at half brightness", "It is on because the collector is connected to +5 V"],
        answerIndex: 0,
        explanation: "With pin 8 LOW there is no base current, so the transistor is off and no collector current flows through the LED. Although this low-side switch does not invert the logic, the LED's anode being at +5 V is not enough — the path to GND must be completed by the transistor.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "A student wires an NPN transistor to switch a buzzer: Arduino pin directly to the base (no resistor), emitter to GND, buzzer from +5 V to the collector. The pin and transistor get warm and the board resets. What is the faulty connection?",
        options: ["The buzzer should be on the emitter side", "The base is connected without a current-limiting resistor", "The emitter should go to +5 V", "The Arduino pin should be set as INPUT"],
        answerIndex: 1,
        explanation: "The base-emitter junction acts like a diode to GND; without a series resistor the pin pushes excessive current into it, overloading the pin. Moving the buzzer to the emitter side creates an emitter follower and does not fix the missing base resistor.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt: "Which drive circuit is the simplest correct choice for a motor that must run in ONE direction only, with PWM speed control (e.g. a cooling fan)?",
        options: ["An L298N with only IN1 connected", "Two diodes in series with the motor", "A relay switched directly from an Arduino pin", "A logic-level N-MOSFET low-side switch with a flyback diode"],
        answerIndex: 3,
        explanation: "One MOSFET plus a flyback diode switches the motor on and off quickly enough for PWM, which is all a one-direction load needs. A relay cannot switch at PWM speeds and its coil needs more current than a pin should supply. An H-bridge is only necessary when you need reverse.",
        difficulty: 2,
      },
    ],
  }),
];
