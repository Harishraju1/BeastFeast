/**
 * Honest feature lists for the UI: what the BEAST interpreter runs, and what it rejects.
 * Keep in sync with compile.ts / parser.ts / interpreter.ts.
 */

export const SUPPORTED_FEATURES: string[] = [
  "setup() and loop(), global and local variables, block scope",
  "Types: int, unsigned int, long, unsigned long, short, byte, char, bool/boolean, float, double, word, size_t, uint8_t…int32_t/uint32_t, String, const char* (read-only text)",
  "const / constexpr / static / volatile qualifiers; plain enums",
  "Real integer sizes: int is 16-bit on AVR boards (Uno, Nano, Mega, Leonardo, Micro, Pro Mini, Nano Every) and 32-bit on ESP32, Pico, ESP8266 and Uno R4 — overflow wraps like on the real board",
  "Integer division truncates, % on integers, float is 32-bit (double is 32-bit on AVR), implicit conversions on assignment, casts (int)x and int(x)",
  "1-D and 2-D arrays with { } initialisers, char arrays from \"text\", sizeof(arr) / sizeof(arr[0])",
  "Functions with parameters and return values (array parameters by reference), recursion, calling functions defined later in the file",
  "if / else, while, do-while, for, switch / case / default (with fall-through), break, continue, return",
  "All arithmetic, comparison, logical, bitwise and shift operators, += -= *= /= %= &= |= ^= <<= >>=, ++ / --, ?:, comma in for loops",
  "Literals: decimal, hex 0x, binary 0b and B1010, octal, U/L/UL suffixes, floats, 'c' chars with escapes, \"strings\"",
  "#define constants and simple function-like macros, #include <Servo.h>, #ifdef / #ifndef / #if / #else / #endif, // and /* */ comments",
  "Constants: HIGH, LOW, INPUT, OUTPUT, INPUT_PULLUP, LED_BUILTIN, A0…, CHANGE, RISING, FALLING, PI, DEC, HEX, BIN, OCT",
  "Digital and analog I/O: pinMode, digitalWrite, digitalRead, analogWrite, analogRead, analogReadResolution / analogWriteResolution (32-bit boards)",
  "Timing: delay, delayMicroseconds, millis, micros, pulseIn (on a virtual clock)",
  "Math: map, constrain, abs, min, max, sq, sqrt, pow, sin, cos, tan, asin, acos, atan, atan2, exp, log, log10, floor, ceil, round, fabs, fmod, radians, degrees",
  "random(max), random(min, max), randomSeed — deterministic (same sequence as avr-libc)",
  "Bits and bytes: bitRead, bitWrite, bitSet, bitClear, bit, highByte, lowByte",
  "Interrupts: attachInterrupt(digitalPinToInterrupt(pin), handler, mode), detachInterrupt, noInterrupts, interrupts",
  "tone(pin, freq[, duration]) and noTone(pin)",
  "Serial (and Serial1 as an alias): begin, print, println (with DEC/HEX/OCT/BIN and float decimals), write, available, read, peek, parseInt, parseFloat, readString, readStringUntil, F(\"…\")",
  "Servo library: attach, write, writeMicroseconds, read, attached, detach",
  "String: + and += with numbers and text, ==, <, length, charAt, [i], indexOf, lastIndexOf, substring, toInt, toFloat, equals, equalsIgnoreCase, startsWith, endsWith, compareTo, concat, trim, toUpperCase, toLowerCase, replace, remove, setCharAt, c_str",
  "Teaching checks: array index out of bounds, division by zero and runaway recursion stop the program with a clear message; warnings for analogWrite on non-PWM pins, digitalWrite without pinMode(OUTPUT), integer overflow in constants, '=' used in a condition, and more",
];

export const UNSUPPORTED_FEATURES: string[] = [
  "Classes and structs (class, struct, union), member functions, inheritance, templates",
  "Pointers (*, &, ->, new, delete, malloc) and references (int &x) — only read-only 'const char*' text is allowed",
  "64-bit integers (long long, int64_t, uint64_t)",
  "goto, exceptions (try/catch/throw), lambdas, namespaces / std::, auto, typedef, enum class",
  "Function overloading and default parameter values",
  "Arrays with more than 2 dimensions; arrays of String text manipulation beyond the listed String methods",
  "Libraries other than Servo: Wire (I2C) and SoftwareSerial can be included/declared but not used; SPI, LiquidCrystal, NeoPixel, etc. are not available",
  "C string functions (sprintf, strcpy, strcmp, atoi, dtostrf, …) — use the String class instead",
  "Stringizing (#) and token pasting (##) in macros; variadic macros",
  "Direct register access (PORTB, DDRB, …), raw ISR() vectors, PROGMEM, EEPROM, sleep modes, watchdog",
  "shiftOut / shiftIn",
  "Exact cycle timing: one interpreter step is a fixed virtual cost (≈1 µs), not real AVR clock cycles — use the AVR emulator (compiled .hex) for cycle accuracy",
];
