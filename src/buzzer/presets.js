// Ready-to-play themed packs for the buzzer edition. Each preset is a complete,
// pre-filled board (plus a title + accent) so the game is playable the moment
// the host opens the link — no setup or customization needed. The host picks a
// pack from the dashboard and gets the three links straight away.

import { DEFAULT_BOARD } from './board'

// ── Halloween pack ──────────────────────────────────────────────────────────
export const HALLOWEEN_BOARD = {
  categories: [
    { name: 'HORROR MOVIES', clues: [
      { v: 200, clue: 'This 1978 slasher about masked killer Michael Myers shares its name with the holiday.', answer: 'Halloween' },
      { v: 400, clue: 'A child-eating clown named Pennywise terrorizes the town of Derry in this Stephen King story.', answer: 'It' },
      { v: 600, clue: 'In this 1993 Tim Burton film, Jack Skellington tries to take over Christmas.', answer: 'The Nightmare Before Christmas' },
      { v: 800, clue: 'Dream-stalking killer Freddy Krueger haunts teens on this fictional street.', answer: 'Elm Street', dd: true },
      { v: 1000, clue: 'Three student filmmakers vanish in the Maryland woods in this 1999 found-footage hit.', answer: 'The Blair Witch Project' },
    ]},
    { name: 'CANDY & TREATS', clues: [
      { v: 200, clue: 'This divisive white, orange, and yellow waxy candy is the quintessential Halloween treat.', answer: 'Candy corn' },
      { v: 400, clue: '"Taste the Rainbow" is the slogan of this bite-size fruity candy.', answer: 'Skittles' },
      { v: 600, clue: 'Reese’s Peanut Butter Cups come in this seasonal carved-gourd shape each October.', answer: 'A pumpkin' },
      { v: 800, clue: 'This chocolate bar "satisfies" and is named after a founder’s favorite horse.', answer: 'Snickers', dd: true },
      { v: 1000, clue: 'Willy Wonka’s Everlasting Gobstopper is a fictional version of this jaw-straining hard candy.', answer: 'A jawbreaker' },
    ]},
    { name: 'TRADITIONS', clues: [
      { v: 200, clue: 'Kids shout these three words at the door in exchange for candy.', answer: 'Trick or treat' },
      { v: 400, clue: 'You carve a spooky face into this gourd to make a jack-o’-lantern.', answer: 'A pumpkin' },
      { v: 600, clue: 'Halloween always falls on the final day of this month.', answer: 'October' },
      { v: 800, clue: 'Fishing for this fruit in a tub of water is a classic Halloween party game.', answer: 'Apples (bobbing for apples)' },
      { v: 1000, clue: 'Halloween grew out of this ancient Celtic harvest festival.', answer: 'Samhain' },
    ]},
    { name: 'IN COSTUME', clues: [
      { v: 200, clue: 'A white bedsheet with two eyeholes makes the simplest costume of this spooky spirit.', answer: 'A ghost' },
      { v: 400, clue: 'Count Dracula is the most famous of these caped, blood-drinking creatures.', answer: 'A vampire' },
      { v: 600, clue: 'A witch traditionally flies through the night astride this household cleaning tool.', answer: 'A broom(stick)' },
      { v: 800, clue: 'This green, bolt-necked monster is stitched together by a doctor of the same name.', answer: 'Frankenstein’s monster' },
      { v: 1000, clue: 'In Scooby-Doo, the "monster" almost always turns out to be a person wearing one of these.', answer: 'A mask' },
    ]},
    { name: 'CREEPY CREATURES', clues: [
      { v: 200, clue: 'This nocturnal flying mammal is a staple of vampire lore and haunted houses.', answer: 'A bat' },
      { v: 400, clue: 'This eight-legged weaver decorates every haunted house with its silk.', answer: 'A spider' },
      { v: 600, clue: 'A black one of these common pets crossing your path is said to bring bad luck.', answer: 'A cat' },
      { v: 800, clue: 'These shuffling undead crave "brains" and headline many a Halloween horde.', answer: 'Zombies' },
      { v: 1000, clue: 'This cursed human transforms into a wolf under the light of a full moon.', answer: 'A werewolf' },
    ]},
    { name: 'SPOOKY GRAB BAG', clues: [
      { v: 200, clue: '"Who you gonna call?" is the catchphrase of this 1984 paranormal-exterminator comedy.', answer: 'Ghostbusters' },
      { v: 400, clue: 'A Headless Horseman haunts this "sleepy" New York village in Washington Irving’s tale.', answer: 'Sleepy Hollow' },
      { v: 600, clue: 'This orange squash-and-spice flavor floods coffee shops every fall.', answer: 'Pumpkin spice' },
      { v: 800, clue: 'The three witch sisters in the movie "Hocus Pocus" go by this family surname.', answer: 'The Sanderson Sisters' },
      { v: 1000, clue: 'This glowing, floating orb of ghostly light is said to lead travelers astray in swamps.', answer: 'A will-o’-the-wisp' },
    ]},
  ],
  final: {
    category: 'HALLOWEEN HISTORY',
    clue: 'Before pumpkins, the Irish carved the first jack-o’-lanterns out of this humble root vegetable.',
    answer: 'A turnip',
  },
}

// All buzzer packs, keyed by id. `theme.accent` tints the whole game show.
export const BUZZER_PRESETS = {
  party: {
    id: 'party', label: 'Buzzed In · Party Pack', emoji: '📣',
    blurb: 'A general-knowledge board — ready to play right away.',
    title: 'Buzzed In', theme: {}, board: DEFAULT_BOARD,
  },
  halloween: {
    id: 'halloween', label: 'Buzzed In · Halloween', emoji: '🎃',
    blurb: 'Spooky clues — horror movies, candy, traditions & more. Ready to play.',
    title: 'Halloween Buzzed In', theme: { accent: '#e07b2f' }, board: HALLOWEEN_BOARD,
  },
}
