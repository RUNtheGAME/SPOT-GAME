import { FAMILY_MEMBERS_SEED } from './familyMembersSeed.js';
import { getFallbackImageUrlByName } from '@/lib/memberImageFallbacks';

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'");
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function createMemberFromSeed(seedRow, index) {
  const id = normalizeText(seedRow.id) || `seed_${index + 1}`;
  return {
    id,
    name: normalizeName(seedRow.name),
    gender: normalizeText(seedRow.gender) || 'לא ידוע',
    generation: parseNumber(seedRow.generation),
    birth_year: parseNumber(seedRow.birth_year),
    birth_date: toNullableText(seedRow.birth_date),
    date_of_death: toNullableText(seedRow.date_of_death),
    father_id: null,
    mother_id: null,
    spouse_id: null,
    father_name: normalizeName(seedRow.father_name),
    mother_name: normalizeName(seedRow.mother_name),
    spouse_name: normalizeName(seedRow.spouse_name),
    wedding_date: toNullableText(seedRow.wedding_date),
    phone_number: normalizeText(seedRow.phone_number),
    email: normalizeText(seedRow.email),
    city: normalizeText(seedRow.city),
    neighborhood: normalizeText(seedRow.neighborhood),
    street: normalizeText(seedRow.street),
    house_number: normalizeText(seedRow.house_number),
    notes: normalizeText(seedRow.notes),
    image_url: toNullableText(seedRow.image_url) || getFallbackImageUrlByName(seedRow.name),
  };
}

function buildNameIndex(members) {
  const byName = new Map();
  members.forEach((member) => {
    const key = normalizeName(member.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(member);
  });
  return byName;
}

function pickCandidate(candidates, currentMember, relationType) {
  const withoutSelf = candidates.filter((candidate) => candidate.id !== currentMember.id);
  if (withoutSelf.length === 1) return withoutSelf[0];

  if (relationType === 'spouse') {
    const sameGeneration = withoutSelf.filter((candidate) => candidate.generation === currentMember.generation);
    if (sameGeneration.length === 1) return sameGeneration[0];
  }

  if (relationType === 'father' || relationType === 'mother') {
    if (typeof currentMember.generation === 'number') {
      const oneGenerationAbove = withoutSelf.filter((candidate) => candidate.generation === currentMember.generation - 1);
      if (oneGenerationAbove.length === 1) return oneGenerationAbove[0];
    }
  }

  return null;
}

function resolveIdByName(name, currentMember, relationType, nameIndex) {
  const key = normalizeName(name);
  if (!key) return null;
  const candidates = nameIndex.get(key) || [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1 && candidates[0].id !== currentMember.id) return candidates[0].id;

  const candidate = pickCandidate(candidates, currentMember, relationType);
  return candidate ? candidate.id : null;
}

export function buildResolvedSeedMembers(seedRows = FAMILY_MEMBERS_SEED) {
  const members = seedRows
    .map((seedRow, index) => createMemberFromSeed(seedRow, index))
    .filter((member) => !!member.name);

  const byId = Object.fromEntries(members.map((member) => [member.id, member]));
  const byName = buildNameIndex(members);

  members.forEach((member) => {
    member.father_id = resolveIdByName(member.father_name, member, 'father', byName);
    member.mother_id = resolveIdByName(member.mother_name, member, 'mother', byName);
    member.spouse_id = resolveIdByName(member.spouse_name, member, 'spouse', byName);
  });

  members.forEach((member) => {
    if (member.spouse_id) {
      const spouse = byId[member.spouse_id];
      if (spouse) {
        member.spouse_name = spouse.name;
        if (!spouse.spouse_id) spouse.spouse_id = member.id;
        if (!spouse.spouse_name) spouse.spouse_name = member.name;
      }
    }
    if (member.father_id && !member.father_name) {
      member.father_name = byId[member.father_id]?.name || '';
    }
    if (member.mother_id && !member.mother_name) {
      member.mother_name = byId[member.mother_id]?.name || '';
    }
  });

  return members;
}

export const RESOLVED_FAMILY_MEMBERS_SEED = buildResolvedSeedMembers();
