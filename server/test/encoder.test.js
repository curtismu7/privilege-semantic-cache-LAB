import test from 'node:test';
import assert from 'node:assert/strict';
import { DIMS, ENCODER_LABEL, EMBEDDING_MODELS, EMBEDDING_MODEL_IDS, cosine, embed, normalizeText, similarity } from '../src/encoder.js';

// 16 triples chosen for this lab: [anchor, paraphrase, unrelated]. The paraphrases reuse wording on purpose: the stand-in measures
// shared text, not meaning, and the README says so. A paraphrase must always score higher than an unrelated prompt, by a clear margin.
const TABLE = [
  ['How do I reset my password?', 'How can I reset my password', 'What is the capital of France?'],
  ['What is the capital of France?', 'Which city is the capital of France?', 'How do I reset my password?'],
  ['Summarize this quarterly sales report', 'Please summarize the quarterly sales report', 'Write a poem about autumn leaves'],
  ['What are your opening hours on Sunday?', 'What time do you open on Sunday?', 'Convert 30 miles to kilometres'],
  ['Explain how photosynthesis works', 'Can you explain how photosynthesis works?', 'List three uses for baking soda'],
  ['Translate good morning into Spanish', 'How do you say good morning in Spanish?', 'What is the boiling point of water?'],
  ['Give me a recipe for vegetable soup', 'Give me a recipe for a vegetable soup please', 'Who won the 1998 World Cup?'],
  ['How do I cancel my subscription?', 'How can I cancel my subscription', 'Explain the rules of chess'],
  ['What is the weather like in Paris today?', 'What is the weather in Paris today?', 'Draft an email asking for a refund'],
  ['Show me the latest invoice for my account', 'Show me my latest invoice', 'How tall is Mount Everest?'],
  ['Why is the sky blue?', 'Why is the sky blue during the day?', 'Recommend a book about gardening'],
  ['How many calories are in an apple?', 'How many calories does an apple have?', 'Reset the router to factory settings'],
  ['Tell me a joke about cats', 'Tell me a funny joke about cats', 'Calculate the area of a circle with radius 4'],
  ['What is the refund policy for online orders?', 'What is your refund policy on online orders?', 'Describe the plot of Hamlet'],
  ['Best way to learn Python quickly', 'What is the best way to learn Python fast?', 'How do vaccines train the immune system?'],
  ['Update my shipping address', 'Change my shipping address', 'What year did the Berlin Wall fall?'],
];

test('the encoder is labelled as a stand-in, not a real embedding model', () => {
  assert.match(ENCODER_LABEL, /not a real embedding model/);
});

test('determinism: the same text gives the same vector, every time, and a fixed dimension', () => {
  for (const m of EMBEDDING_MODEL_IDS) {
    const a = embed(m, 'How do I reset my password?'); const b = embed(m, 'How do I reset my password?');
    assert.equal(a.length, DIMS);
    assert.deepEqual(Array.from(a), Array.from(b));
  }
  // Pinned scores: the encoder must not drift between runs or Node versions (a change here changes every scenario).
  assert.equal(similarity('lab-embed-a', 'hello world', 'hello there'), 0.454545);
  assert.equal(similarity('lab-embed-c', 'hello world', 'hello there'), 0.692935);
  const v = embed('lab-embed-a', 'hello world');
  assert.equal(cosine(v, v), 1);
});

test('vectors are unit length', () => {
  const v = embed('lab-embed-a', 'Explain how photosynthesis works');
  assert.ok(Math.abs(Array.from(v).reduce((s, x) => s + x * x, 0) - 1) < 1e-9);
});

test('normalisation: case, punctuation and spacing do not matter; nothing left means nothing to encode', () => {
  assert.equal(normalizeText('  Hello,   WORLD!! '), 'hello world');
  assert.equal(similarity('lab-embed-a', 'Hello, World!', 'hello   world'), 1);
  assert.equal(embed('lab-embed-a', '???'), null);
  assert.equal(embed('lab-embed-a', ''), null);
  assert.equal(embed('lab-embed-a', '   '), null);
});

test('an unknown embedding model is refused, including prototype names', () => {
  for (const m of ['nope', '__proto__', 'constructor', 'toString', undefined, 5]) assert.throws(() => embed(m, 'x'), RangeError, String(m));
});

test('different embedding model ids are different encoders: the same text gives different vectors and they do not agree', () => {
  const sizes = new Set(Object.values(EMBEDDING_MODELS).map((c) => `${c.ngram}/${c.seed}`));
  assert.equal(sizes.size, EMBEDDING_MODEL_IDS.length, 'every model has its own (n-gram size, seed)');
  const text = 'Show me my latest invoice';
  for (const x of EMBEDDING_MODEL_IDS) for (const y of EMBEDDING_MODEL_IDS) {
    if (x >= y) continue;
    assert.notDeepEqual(Array.from(embed(x, text)), Array.from(embed(y, text)), `${x} vs ${y}`);
    const agree = cosine(embed(x, text), embed(y, text));
    assert.ok(agree < 0.5, `${x} vs ${y}: the same text scores ${agree} across two encoders`); // never close to the in-model score of 1
  }
});

test(`similarity ordering: a paraphrase beats an unrelated prompt on all ${TABLE.length} pairs, for every model`, () => {
  assert.ok(TABLE.length >= 15);
  for (const m of EMBEDDING_MODEL_IDS) {
    for (const [anchor, para, other] of TABLE) {
      const p = similarity(m, anchor, para); const u = similarity(m, anchor, other);
      assert.ok(p > u + 0.15, `${m}: "${para}" ${p} should beat "${other}" ${u} against "${anchor}"`);
    }
  }
});

test('on the default model a paraphrase scores above 0.4 and an unrelated prompt below 0.35, so a strictness between them separates them', () => {
  for (const [anchor, para, other] of TABLE) {
    assert.ok(similarity('lab-embed-a', anchor, para) > 0.4, para);
    assert.ok(similarity('lab-embed-a', anchor, other) < 0.35, other);
  }
});

test('similarity is symmetric and an identical text scores exactly 1', () => {
  for (const [a, b] of TABLE) {
    assert.equal(similarity('lab-embed-a', a, b), similarity('lab-embed-a', b, a));
    assert.equal(similarity('lab-embed-a', a, a), 1);
  }
});

test('the stand-in measures shared text, not meaning: a true paraphrase with no shared words scores low (the lab says so)', () => {
  assert.ok(similarity('lab-embed-a', 'How do I get my money back?', 'What is your refund policy') < 0.4);
});

test('a very long prompt and non-Latin text encode without error', () => {
  assert.equal(embed('lab-embed-a', 'a'.repeat(20000)) !== null, true);
  assert.equal(embed('lab-embed-d', 'пароль сброс 密码重置').length, DIMS);
  assert.equal(embed('lab-embed-a', 'ab').length, DIMS); // shorter than the n-gram size still encodes (padded with spaces)
});

test('cosine refuses vectors of different lengths', () => {
  assert.throws(() => cosine(new Float64Array(3), new Float64Array(4)), TypeError);
});
