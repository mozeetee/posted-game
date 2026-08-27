// Default pre-written board for the buzzer edition (the "party pack" theme).
// A game's board lives in games.data.board so the host can swap any clue, the
// same way they edit questions in the other editions. `dd: true` marks a Daily
// Double (hidden until a player lands on it). Values go $200–$1000 down each
// column. Personalized (survey-sourced) categories get layered in later.

export const DEFAULT_BOARD = {
  categories: [
    { name: '90s KID', clues: [
      { v: 200, clue: 'This slap-on wrist accessory was a recess staple.', answer: 'A slap bracelet' },
      { v: 400, clue: 'Furbies and Tamagotchis both fall into this needy toy category.', answer: 'Virtual pets' },
      { v: 600, clue: 'This orange comic-strip cat lived to hate Mondays.', answer: 'Garfield' },
      { v: 800, clue: 'Kids traded these circular cardboard game discs on the playground.', answer: 'POGs' },
      { v: 1000, clue: "Uncle Jesse's two-word catchphrase on 'Full House.'", answer: '"Have mercy"' },
    ]},
    { name: 'SNACK TIME', clues: [
      { v: 200, clue: "Guacamole's main ingredient.", answer: 'Avocado' },
      { v: 400, clue: "This Italian word for 'flat' shows up covered in toppings.", answer: 'Pizza' },
      { v: 600, clue: "An espresso 'stained' with just a dab of foamed milk.", answer: 'A macchiato' },
      { v: 800, clue: 'Pepper heat is measured on this named scale.', answer: 'The Scoville scale' },
      { v: 1000, clue: 'This fermented, usually-cabbage Korean side dish.', answer: 'Kimchi' },
    ]},
    { name: 'MOVIE NIGHT', clues: [
      { v: 200, clue: "This swamp ogre's best friend is a fast-talking donkey.", answer: 'Shrek' },
      { v: 400, clue: "'I'll be back' launched this time-traveling sci-fi franchise.", answer: 'The Terminator' },
      { v: 600, clue: "In this Pixar film, five emotions run a young girl's mind.", answer: 'Inside Out' },
      { v: 800, clue: 'A 1997 blockbuster with a sinking ship and one very roomy door.', answer: 'Titanic' },
      { v: 1000, clue: 'He directed Jaws, E.T., and Jurassic Park.', answer: 'Steven Spielberg' },
    ]},
    { name: 'CRITTERS', clues: [
      { v: 200, clue: 'The tallest animal on land.', answer: 'A giraffe' },
      { v: 400, clue: 'A group of crows goes by this ominous collective noun.', answer: 'A murder' },
      { v: 600, clue: 'This eight-armed ocean animal has three hearts and blue blood.', answer: 'An octopus', dd: true },
      { v: 800, clue: 'The only mammal capable of true, sustained flight.', answer: 'A bat' },
      { v: 1000, clue: 'The name for a baby kangaroo.', answer: 'A joey' },
    ]},
    { name: 'NAME THAT TUNE', clues: [
      { v: 200, clue: 'She just wants to "Shake It Off."', answer: 'Taylor Swift' },
      { v: 400, clue: 'The Beatles first found fame in this English port city.', answer: 'Liverpool' },
      { v: 600, clue: 'A standard one of these keyboard instruments has 88 keys.', answer: 'A piano' },
      { v: 800, clue: "'Bohemian Rhapsody' is this band's six-minute operatic epic.", answer: 'Queen' },
      { v: 1000, clue: '1970s Jamaican genre that Bob Marley took worldwide.', answer: 'Reggae' },
    ]},
    { name: 'GRAB BAG', clues: [
      { v: 200, clue: 'The number of players each team has on a basketball court.', answer: 'Five' },
      { v: 400, clue: 'The nickname for Mars.', answer: 'The Red Planet' },
      { v: 600, clue: "Japan's currency.", answer: 'The yen', dd: true },
      { v: 800, clue: "'Au' is the chemical symbol for this precious metal.", answer: 'Gold' },
      { v: 1000, clue: 'This northeast-African river is usually called the world’s longest.', answer: 'The Nile' },
    ]},
  ],
  // One shared final clue: every player wagers privately, writes an answer, and
  // all reveals happen together — the moment a static template can't do.
  final: {
    category: 'WORLD CAPITALS',
    clue: 'This planned inland city, not Sydney or Melbourne, is the national capital of Australia.',
    answer: 'Canberra',
  },
}

// Warm game-show palette (deliberately not Jeopardy's navy + cold gold).
export const BZ = {
  paper: '#ece4d2', paper2: '#e3d9c4', ink: '#332f27', muted: '#8a7f68', line: '#d8ccb2',
  screen: '#2b2030', screen2: '#392a3f', screenLine: '#4d3a54', cream: '#f4ecd9',
  gold: '#e0a44a', goldDeep: '#c98a2f', sage: '#5f8c5a', sageDeep: '#4f6b50',
  clay: '#c0553a', plum: '#8f5a73', teal: '#4f7d73',
}

// Stable per-player accent colors, assigned by join order.
export const PLAYER_COLORS = ['#8f5a73', '#4f7d73', '#c98a2f', '#5f8c5a', '#c0553a', '#5b6bb0']
