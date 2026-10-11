/*
 * Decision categories for Next Move.
 * To add a category, add one entry to CATEGORIES below.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CATEGORIES = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------
  // Decision categories. Each one has its own factors, wording,
  // time frames and example. The scoring method is the same for all.
  //
  // Example format:
  //   factors: preset keys (5 of them)
  //   deal:    [factor index, minimum] or null
  //   pairs:   10 answers (-2..2) for factor pairs in this order:
  //            0-1, 0-2, 0-3, 0-4, 1-2, 1-3, 1-4, 2-3, 2-4, 3-4
  //   grid:    for each factor, [short term, long term] per option
  //   lean, regret: option index
  // ---------------------------------------------------------
  const P = (key, name, desc) => ({ key, name, desc });

  const CATEGORIES = {
    career: {
      label: "Career",
      question: "e.g. Which job offer should I take?",
      option: "e.g. Marketing role at a startup",
      now: "First year", later: "In 3 years",
      worst: "e.g. The company runs out of money within a year",
      presets: [
        P("salary",   "Salary and pay",          "How much you earn"),
        P("benefits", "Benefits",                "Leave, insurance, bonuses, allowances"),
        P("growth",   "Learning and growth",     "How fast you build new skills"),
        P("capital",  "Career capital",          "How much it opens doors for your future"),
        P("balance",  "Work-life balance",       "Hours, stress, and time for life outside work"),
        P("security", "Job security",            "How stable the role and company are"),
        P("commute",  "Commute and flexibility", "Travel time, remote or hybrid options"),
        P("people",   "Team and manager",        "The people you work with every day"),
        P("culture",  "Company culture",         "How the company treats people"),
        P("meaning",  "Meaningful work",         "How much the work matters to you")
      ],
      example: {
        question: "Which job offer should I take?",
        options: ["Startup (product role)", "Bank (analyst role)", "Stay at current job"],
        factors: ["salary", "growth", "balance", "security", "capital"],
        deal: [2, 2],
        pairs: [-1, 1, 1, -1, 1, 2, 0, 1, -1, -1],
        grid: [
          [[3, 4], [5, 5], [2, 2]],
          [[5, 5], [3, 3], [1, 1]],
          [[2, 2], [4, 3], [4, 4]],
          [[1, 2], [5, 5], [4, 3]],
          [[4, 5], [3, 4], [1, 1]]
        ],
        lean: 1, regret: 0,
        worst: ["The startup runs out of money within a year and I'm job hunting again.", "I get bored and feel stuck after two years.", "I stop growing and fall behind my peers."],
        reverse: ["easy", "easy", "costly"]
      }
    },

    dating: {
      label: "Dating and relationships",
      question: "e.g. Should I go on a date with Sam?",
      option: "e.g. Go on the date",
      now: "Right away", later: "In a few months",
      worst: "e.g. An awkward evening",
      note: "If you ever feel unsafe or pressured by someone, trust that feeling over any score. Your safety isn't something to trade off.",
      presets: [
        P("chemistry",  "Attraction and chemistry",      "How drawn you feel to them"),
        P("respect",    "Feeling safe and respected",    "How they treat you and the people around them"),
        P("fun",        "Fun together",                  "How much you enjoy their company"),
        P("values",     "Shared values",                 "Agreement on the things that matter most to you"),
        P("goals",      "Shared life goals",             "Where you each want your lives to go"),
        P("timing",     "Right timing",                  "Whether you have the time and headspace right now"),
        P("effort",     "Low effort and cost",           "The time, money and energy it takes"),
        P("friendship", "Protects existing friendships", "Less risk of making things awkward with friends"),
        P("support",    "Support from people close to me", "What the friends and family who know you best think"),
        P("growth",     "Personal growth",               "Whether it helps you grow or learn about yourself")
      ],
      example: {
        question: "Should I go on a date with Sam?",
        options: ["Go on the date", "Politely say no"],
        factors: ["chemistry", "respect", "fun", "timing", "effort"],
        deal: [1, 3],
        pairs: [-1, 1, 1, 2, 2, 2, 2, 0, 1, 1],
        grid: [
          [[4, 4], [1, 1]],
          [[4, 4], [5, 5]],
          [[4, 4], [2, 2]],
          [[3, 3], [4, 3]],
          [[3, 3], [5, 5]]
        ],
        lean: 1, regret: 0,
        worst: ["An awkward evening and a bit of wasted time.", "I keep wondering what could have happened."],
        reverse: ["easy", "costly"]
      }
    },

    study: {
      label: "Study",
      question: "e.g. Which course should I study?",
      option: "e.g. Computer science",
      now: "While studying", later: "After graduating",
      worst: "e.g. I lose interest halfway through",
      presets: [
        P("interest",    "Genuine interest",          "How much you enjoy the subject"),
        P("strengths",   "Fits my strengths",         "How well it suits your skills"),
        P("jobs",        "Job prospects",             "Demand for graduates and starting pay"),
        P("afford",      "Affordability",             "Fees and living costs you can manage"),
        P("quality",     "Quality of the institution", "Teaching, reputation and facilities"),
        P("location",    "Location",                  "Where you'd live while studying"),
        P("duration",    "Quick to finish",           "Shorter is better if you want to start working soon"),
        P("flexibility", "Keeps options open",        "How easy it is to switch paths later"),
        P("support",     "Family support",            "How the people backing you feel about it"),
        P("life",        "Student life",              "Friends, activities and campus life")
      ],
      example: {
        question: "Which course should I study?",
        options: ["Computer science", "Business", "Psychology"],
        factors: ["interest", "jobs", "afford", "strengths", "duration"],
        deal: [2, 2],
        pairs: [1, 1, 0, 2, 0, -1, 1, -1, 1, 2],
        grid: [
          [[3, 3], [2, 2], [5, 5]],
          [[4, 5], [4, 4], [2, 3]],
          [[3, 3], [4, 4], [4, 4]],
          [[3, 4], [3, 3], [5, 5]],
          [[3, 3], [4, 4], [2, 2]]
        ],
        lean: 0, regret: 2,
        worst: ["I struggle with the maths and lose motivation.", "I find it dull and just drift through.", "Jobs are harder to find after I graduate."],
        reverse: ["costly", "costly", "costly"]
      }
    },

    living: {
      label: "Where to live",
      question: "e.g. Should I move to a new city?",
      option: "e.g. Move to the city",
      now: "First year", later: "In 3 years",
      worst: "e.g. I feel lonely and money is tight",
      presets: [
        P("afford",    "Affordability",              "Rent and cost of living"),
        P("jobs",      "Career opportunities",       "Jobs and pay in the area"),
        P("family",    "Close to family and friends", "How easily you can see the people you love"),
        P("safety",    "Safety",                     "How safe you'd feel day and night"),
        P("commute",   "Easy commute",               "Getting to work, study and errands"),
        P("lifestyle", "Lifestyle",                  "Food, activities and things to do"),
        P("space",     "Space and comfort",          "The size and quality of your home"),
        P("nature",    "Environment",                "Green space, clean air, quiet"),
        P("community", "Community",                  "Feeling like you belong"),
        P("growth",    "New experiences",            "How much you'd grow from the change")
      ],
      example: {
        question: "Should I move to a new city?",
        options: ["Move to the city", "Stay in my hometown"],
        factors: ["afford", "jobs", "family", "lifestyle", "safety"],
        deal: [4, 3],
        pairs: [0, -1, 1, -1, -1, 1, -1, 1, 0, -1],
        grid: [
          [[2, 3], [4, 4]],
          [[5, 5], [2, 2]],
          [[2, 2], [5, 5]],
          [[4, 5], [3, 3]],
          [[4, 4], [5, 5]]
        ],
        lean: 1, regret: 0,
        worst: ["I feel lonely and money is tight.", "I feel stuck and miss opportunities."],
        reverse: ["easy", "easy"]
      }
    },

    purchase: {
      label: "Big purchase",
      question: "e.g. Which car should I buy?",
      option: "e.g. Used SUV",
      now: "When I buy it", later: "In 3 years",
      worst: "e.g. It breaks down and repairs cost a lot",
      presets: [
        P("afford",   "Affordability",          "Price compared with your budget"),
        P("quality",  "Quality and reliability", "How well it's made and how long it lasts"),
        P("running",  "Low running costs",      "Fuel, maintenance, subscriptions"),
        P("features", "Features I need",        "Does what you actually need it to do"),
        P("comfort",  "Comfort and ease of use", "How pleasant it is to use every day"),
        P("looks",    "Look and feel",          "How much you like it"),
        P("resale",   "Resale value",           "What you could sell it for later"),
        P("reviews",  "Good reviews",           "What other owners say"),
        P("warranty", "Warranty and support",   "Help if something goes wrong"),
        P("need",     "Real need",              "How much you'd actually use it")
      ],
      example: {
        question: "Which car should I buy?",
        options: ["New compact car", "Used SUV", "Keep my current car"],
        factors: ["afford", "quality", "running", "comfort", "resale"],
        deal: [0, 2],
        pairs: [0, 1, 1, 2, 1, 1, 2, 0, 1, 1],
        grid: [
          [[2, 2], [3, 3], [5, 5]],
          [[5, 5], [3, 2], [2, 1]],
          [[4, 4], [2, 2], [3, 2]],
          [[4, 4], [5, 4], [2, 2]],
          [[3, 3], [2, 2], [1, 1]]
        ],
        lean: 1, regret: 0,
        worst: ["The monthly payments stretch my budget.", "Repairs start adding up.", "It breaks down at a bad moment."],
        reverse: ["hard", "costly", "easy"]
      }
    },

    other: {
      label: "Something else",
      question: "e.g. Should I take a gap year?",
      option: "e.g. Take a gap year",
      now: "Short term", later: "Long term",
      worst: "e.g. It doesn't work out and I lose time",
      presets: [
        P("happiness",     "Happiness",            "How it would make you feel day to day"),
        P("growth",        "Personal growth",      "What you'd learn or become"),
        P("afford",        "Affordability",        "Whether you can manage the cost"),
        P("time",          "Low time and effort",  "How much it takes from you"),
        P("health",        "Health and wellbeing", "Effect on your body and mind"),
        P("relationships", "Relationships",        "Effect on the people close to you"),
        P("risk",          "Low risk",             "How likely it is to go badly"),
        P("values",        "Fits my values",       "Whether it matches who you want to be"),
        P("peace",         "Peace of mind",        "How settled you'd feel about it"),
        P("fun",           "Fun and enjoyment",    "How much you'd enjoy it")
      ],
      example: {
        question: "Should I take a gap year?",
        options: ["Take a gap year", "Start university now"],
        factors: ["happiness", "growth", "afford", "relationships", "risk"],
        deal: null,
        pairs: [0, 1, 0, 1, 1, 1, 1, -1, 0, 1],
        grid: [
          [[4, 4], [3, 4]],
          [[5, 4], [3, 4]],
          [[2, 2], [3, 3]],
          [[3, 3], [4, 4]],
          [[2, 3], [4, 4]]
        ],
        lean: 1, regret: 0,
        worst: ["I lose momentum and find it hard to go back to studying.", "I burn out because I really needed a break."],
        reverse: ["costly", "costly"]
      }
    }
  };

  return CATEGORIES;
});
