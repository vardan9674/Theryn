// Shared design tokens for template components (mirrors App.jsx tokens)
export const A   = "#C8FF00";
export const BG  = "#080808";
export const S1  = "#101010";
export const S2  = "#181818";
export const BD  = "#1E1E1E";
export const TX  = "#F0F0F0";
export const SB  = "#585858";
export const MT  = "#2C2C2C";
export const RED = "#FF5C5C";

export const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const DAY_INDEX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
export const INDEX_DAY = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export const WORKOUT_TYPES = [
  "Push","Pull","Legs","Upper","Lower","Full Body",
  "Core","Cardio","Rest","Run","Swim","Bike","HIIT","Yoga","Custom"
];

export const TYPE_COLORS = {
  Push:"#FF8C42", Pull:"#4ECDC4", Legs:"#A8E6CF", Upper:"#C77DFF",
  Lower:"#FFD166", Rest:SB, Cardio:"#06D6A0", "Full Body":A,
  Core:"#FFD166", Run:"#06D6A0", Swim:"#4ECDC4", Bike:"#FFD166",
  HIIT:"#FF8C42", Yoga:"#C77DFF", Custom:SB,
};

export const TYPE_DEFAULTS = {
  Push:      ["Bench Press","Incline DB Press","Cable Fly","Tricep Pushdown","Lateral Raise"],
  Pull:      ["Deadlift","Barbell Row","Lat Pulldown","Face Pull","Barbell Curl"],
  Legs:      ["Squat","Leg Press","Romanian DL","Leg Curl","Calf Raise"],
  Upper:     ["Bench Press","Barbell Row","OHP","Barbell Curl","Tricep Pushdown"],
  Lower:     ["Squat","Romanian DL","Leg Press","Leg Curl","Calf Raise"],
  "Full Body":["Squat","Bench Press","Deadlift","OHP","Pull Ups"],
  Core:      ["Plank","Hanging Leg Raise","Cable Crunch","Ab Wheel Rollout"],
  Run:       ["Treadmill Run"],
  Swim:      ["Swimming"],
  Bike:      ["Stationary Bike"],
  HIIT:      ["Burpees","Jump Squat","Mountain Climbers","Battle Ropes"],
  Yoga:      ["Stretch Flow"],
  Cardio:    ["Treadmill Run","Stationary Bike"],
  Custom:    [],
  Rest:      [],
};
