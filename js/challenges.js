// Challenge list. Fields: [category, name, points, unit?]
// When a unit is given, points are per unit and the host enters a count.
// Edit freely: ids are derived from position, so append new rows at the
// END of the list once the hunt has started to keep existing ids stable.
const RAW = [
  ["drink", "Pour a beer down your pants", 100],
  ["drink", "Do a shoey", 75],
  ["drink", "Chug a Cutwater", 150],
  ["drink", "Drink a Four Loko", 150],
  ["drink", "Shotgun a beer on A Mountain", 100],
  ["drink", "Run a beer mile (2.5 laps around the SDFC field)", 300],
  ["drink", "Have one person drink a bottle of wine on video", 300],
  ["drink", "Throw up", 50],
  ["drink", "Bring liquor to the party: per can", 50, "can"],
  ["drink", "Bring liquor to the party: per bottle", 200, "bottle"],
  ["drink", "Get high and go to Denny's", 150],
  ["drink", "Split a joint or some form of weed with your team", 200],
  ["drink", "Bring Tatum an edible", 10],
  ["drink", "Drunk-call five people", 50],

  ["water", "Jump into Tempe Town Lake", 600],
  ["water", "Jump into the Old Main Fountain", 250],
  ["water", "Jump into the W. P. Carey Fountain", 250],
  ["water", "Jump into the Barrett Fountain", 250],
  ["water", "Go skinny-dipping", 400],
  ["water", "Pee off the Tempe Town Lake bridge: per person holding hands", 35, "person"],

  ["heist", "Steal the baby back from Romo!", 500],
  ["heist", "Find the baby", 2000],
  ["heist", "Steal a piece of a stranger's costume", 80],
  ["heist", "Steal a traffic sign", 600],
  ["heist", "Steal a traffic cone", 300],
  ["heist", "Steal a sign that says 420", 300],
  ["heist", "Steal a door nameplate", 8, "nameplate"],
  ["heist", "Steal enough door nameplates to spell out the entire alphabet", 200],
  ["heist", "TP the house of someone who's present", 250],
  ["heist", "Hide rocks in the Tooker drying machines", 5, "machine"],
  ["heist", "Wear clothes you find behind the dryer", 50],

  ["campus", "Smoke a cigarette on top of the ASU Art Museum building", 75],
  ["campus", "Make a human pyramid in the Secret Garden", 150],
  ["campus", "Film a dorm tour", 100],
  ["campus", "Dorm tour ALL dorms (Hassayampa, Sonora, Barrett, Vista, Tooker, Manzanita, Palo Verde)", 700],
  ["campus", "Grill a hot dog at the GLV", 150],
  ["campus", "Take a selfie with an El P employee", 75],
  ["campus", "Climb onto a second-floor balcony at Vista", 150],
  ["campus", "Take a photo on the horse in the WPC building", 100],
  ["campus", "Get on top of Bulldog Hall and smoke a cigarette", 125],
  ["campus", "Sneak into a classroom or lecture hall", 75],
  ["campus", "Do an entire lap around the SDFC while barking", 150],
  ["campus", "Play Mario Kart in a random person's dorm", 200],
  ["campus", "Work out in your costume", 75],

  ["social", "Get 50 people to sign your petition", 350],
  ["social", "Take a selfie with a random stranger", 25],
  ["social", "Get publicly rejected while fake-proposing to someone", 150],
  ["social", "Get someone to autograph your forehead", 75],
  ["social", "Get someone's Snap, Instagram, or phone number using a cheesy pickup line", 100],
  ["social", "Get a random person to slow dance with you", 100],
  ["social", "Have a dance battle with strangers", 150],
  ["social", "Take a photo with a police officer", 100],
  ["social", "Do a dare given to you by a stranger", 100],
  ["social", "Find someone wearing the same costume as you", 150],
  ["social", "Cook an egg in a stranger's kitchen", 200],
  ["social", "Fail at ding-dong ditching by staying until someone answers", 75],
  ["social", "Swap costumes", 100],
  ["social", "Bonus: Swap costumes with a stranger", 200],
  ["social", "Box a Waymo in for 5 seconds", 80],
  ["social", "Take a homeless person out to dinner", 400],
  ["social", "Kiss a random stranger", 100],
  ["social", "Sing a love song to a stranger", 150],
  ["social", "Lead a stranger to a party that doesn't exist", 200],
  ["social", "Sneak into a party", 75],
  ["social", "Go trick-or-treating", 100],
  ["social", "Take a picture with an ASU football player", 250],
  ["social", "Get someone to come to the party after it's already started", 250],
  ["social", "Sing karaoke", 50],

  ["stunt", "Find an object or alcoholic drink starting with the first letter of each group member's name", 200],
  ["stunt", "Post a TikTok dance", 100],
  ["stunt", "Dye your hair", 300],
  ["stunt", "Get a buzz cut or shave your head bald", 500],
  ["stunt", "Cover yourself in toilet paper like a mummy", 150],
  ["stunt", "Make a poster and hang it up somewhere", 200],
  ["stunt", "Do a wall sit for an entire song", 100],
  ["stunt", "Leave your sock at Alex's apartment", 75],

  ["penalty", "Not wearing a costume", -200],
  ["penalty", "Being sober: per team member", -100, "member"],
  ["penalty", "Caught cheating", -3000],
  ["penalty", "Leaving before the hunt is over", -100],
  ["penalty", "Saying Alex's name", -25, "time"],
];

export const CHALLENGES = RAW.map(([cat, name, pts, unit], i) => ({
  id: "c" + (i + 1), cat, name, pts, unit: unit || null,
}));

export const BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export const CATEGORIES = [
  ["all", "All"], ["drink", "Drinks"], ["water", "Water"], ["heist", "Heists"],
  ["campus", "Campus"], ["social", "Strangers"], ["stunt", "Stunts"], ["penalty", "Penalties"],
];

export const TEAM_COLORS = [
  "#f3b93b", "#ff7a2f", "#ff5f8f", "#b78cff", "#5fc7ff",
  "#4fe0b5", "#c9e65a", "#f6e8d6", "#ff8a6b", "#8fa8ff",
];
