import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RESOLVED_FAMILY_MEMBERS_SEED } from '@/data/familyMembersResolvedSeed';
import FamilySchematicCanvasVertical from '@/components/FamilySchematicCanvasVertical';
import { resolveMemberImageUrl } from '@/lib/memberImageFallbacks';

function normalizeGeneration(generation) {
  if (generation === null || generation === undefined || generation === '') return null;
  const parsed = Number(generation);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .trim();
}

function formatDisplayName(value) {
  return normalizeName(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[0-9]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

function sortMembers(a, b) {
  if (a.birth_date && b.birth_date) {
    const aDate = new Date(a.birth_date).getTime();
    const bDate = new Date(b.birth_date).getTime();
    if (Number.isFinite(aDate) && Number.isFinite(bDate)) {
      const dateDiff = aDate - bDate;
      if (dateDiff !== 0) return dateDiff;
    }
  }

  if (a.birth_year && b.birth_year) {
    const aYear = Number(a.birth_year);
    const bYear = Number(b.birth_year);
    if (Number.isFinite(aYear) && Number.isFinite(bYear)) {
      const yearDiff = aYear - bYear;
      if (yearDiff !== 0) return yearDiff;
    }
  }

  return String(a.name || '').localeCompare(String(b.name || ''), 'he');
}

function canonicalPersonKey(member) {
  return [
    formatDisplayName(member?.name),
    member?.birth_date || '',
    member?.birth_year || '',
    normalizeGeneration(member?.generation) ?? '',
  ].join('|');
}

function toDateScore(dateString) {
  if (!dateString) return -Infinity;
  const parsed = new Date(dateString).getTime();
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function infoRichnessScore(member) {
  let score = 0;
  if (member?.phone_number) score += 2;
  if (member?.email) score += 2;
  if (member?.city) score += 1;
  if (member?.street) score += 1;
  if (member?.image_url) score += 1;
  if (member?.notes) score += 1;
  return score;
}

function pickPrimaryFromGroup(group) {
  return [...group].sort((a, b) => {
    const weddingDiff = toDateScore(b.wedding_date) - toDateScore(a.wedding_date);
    if (weddingDiff !== 0) return weddingDiff;

    const richnessDiff = infoRichnessScore(b) - infoRichnessScore(a);
    if (richnessDiff !== 0) return richnessDiff;

    return sortMembers(a, b);
  })[0];
}

function pickMergedImageUrl(group, selectedPrimary) {
  const primaryImageUrl = String(selectedPrimary?.image_url || '').trim();
  if (primaryImageUrl) return primaryImageUrl;

  const fallbackMember = group.find((member) => String(member?.image_url || '').trim());
  return fallbackMember ? String(fallbackMember.image_url || '').trim() : '';
}

function getSecondarySpousesForLead(pair, membersById) {
  if (!Array.isArray(pair) || pair.length === 0) return [];
  const lead = pair[0];
  if (!lead || !Array.isArray(lead.secondary_spouse_ids)) return [];
  const pairIds = new Set(pair.map((member) => member.id));

  return lead.secondary_spouse_ids
    .map((id) => membersById[id])
    .filter((member) => member && !pairIds.has(member.id));
}

function toPreferredDisplayPair(pair, membersById) {
  const cleanPair = Array.isArray(pair) ? pair.filter(Boolean) : [];
  if (cleanPair.length === 0) return [];

  const lead = cleanPair[0];
  const primarySpouse = lead?.spouse_id ? membersById[lead.spouse_id] : null;
  if (!primarySpouse) return cleanPair;
  if (cleanPair.some((member) => member.id === primarySpouse.id)) return cleanPair;

  const generation = normalizeGeneration(lead.generation);
  if (generation !== null && generation >= 1) {
    return [lead, primarySpouse];
  }
  return [lead, primarySpouse].sort(sortMembers);
}

function mergeEquivalentMembers(members) {
  const groups = new Map();
  members.forEach((member) => {
    const key = canonicalPersonKey(member);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(member);
  });

  const aliasToPrimary = {};
  const byId = Object.fromEntries(members.map((member) => [member.id, member]));
  const mergedMembers = [];

  groups.forEach((group) => {
    const primary = group.length > 1 ? pickPrimaryFromGroup(group) : group[0];
    group.forEach((member) => {
      aliasToPrimary[member.id] = primary.id;
    });
  });

  groups.forEach((group) => {
    const primary = aliasToPrimary[group[0].id] ? group.find((member) => member.id === aliasToPrimary[group[0].id]) : group[0];
    const selectedPrimary = primary || pickPrimaryFromGroup(group);
    const spouseById = new Map();

    group.forEach((member) => {
      if (!member.spouse_id || !byId[member.spouse_id]) return;
      const mappedSpouseId = aliasToPrimary[member.spouse_id] || member.spouse_id;
      if (!mappedSpouseId || mappedSpouseId === selectedPrimary.id) return;
      const existing = spouseById.get(mappedSpouseId);
      if (!existing || toDateScore(member.wedding_date) > toDateScore(existing.wedding_date)) {
        spouseById.set(mappedSpouseId, {
          spouseId: mappedSpouseId,
          wedding_date: member.wedding_date || null,
        });
      }
    });

    const sortedSpouses = [...spouseById.values()].sort((a, b) => {
      return toDateScore(b.wedding_date) - toDateScore(a.wedding_date);
    });

    const fallbackPrimarySpouseId = selectedPrimary.spouse_id
      ? aliasToPrimary[selectedPrimary.spouse_id] || selectedPrimary.spouse_id
      : null;
    const primarySpouseId = sortedSpouses[0]?.spouseId || fallbackPrimarySpouseId || null;
    const secondarySpouseIds = sortedSpouses
      .map((item) => item.spouseId)
      .filter((spouseId) => spouseId && spouseId !== primarySpouseId && spouseId !== selectedPrimary.id);

    mergedMembers.push({
      ...selectedPrimary,
      image_url: pickMergedImageUrl(group, selectedPrimary),
      father_id: selectedPrimary.father_id ? aliasToPrimary[selectedPrimary.father_id] || selectedPrimary.father_id : null,
      mother_id: selectedPrimary.mother_id ? aliasToPrimary[selectedPrimary.mother_id] || selectedPrimary.mother_id : null,
      spouse_id: primarySpouseId,
      secondary_spouse_ids: [...new Set(secondarySpouseIds)],
      merged_alias_ids: group.map((member) => member.id),
    });
  });

  const mergedById = Object.fromEntries(mergedMembers.map((member) => [member.id, member]));
  const normalized = mergedMembers.map((member) => {
    const spouseName = member.spouse_id && mergedById[member.spouse_id]
      ? mergedById[member.spouse_id].name
      : member.spouse_name;
    return {
      ...member,
      spouse_name: spouseName || '',
    };
  });

  return {
    members: normalized.sort(sortMembers),
    aliasToPrimary,
  };
}

function createSpousePairs(members) {
  const sorted = [...members].sort(sortMembers);
  const byId = Object.fromEntries(sorted.map((member) => [member.id, member]));
  const used = new Set();
  const pairs = [];

  for (const member of sorted) {
    if (used.has(member.id)) continue;

    let spouse = null;

    if (member.spouse_id && byId[member.spouse_id] && !used.has(member.spouse_id)) {
      spouse = byId[member.spouse_id];
    } else {
      spouse = sorted.find((candidate) => {
        if (candidate.id === member.id || used.has(candidate.id)) return false;
        return candidate.spouse_id === member.id;
      }) || null;
    }

    used.add(member.id);

    if (spouse) {
      used.add(spouse.id);
      pairs.push([member, spouse]);
    } else {
      pairs.push([member]);
    }
  }

  return pairs;
}

function isFemale(member) {
  const value = String(member?.gender || '').toLowerCase();
  return value === 'נקבה' || value === 'female';
}

function memberInitials(name) {
  const words = String(formatDisplayName(name) || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '👤';
  return words.slice(0, 2).map((part) => part[0]).join('');
}

function splitMemberName(name) {
  const words = String(formatDisplayName(name) || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: '', lastName: '' };
  if (words.length === 1) return { firstName: words[0], lastName: '' };
  return { firstName: words[0], lastName: words.slice(1).join(' ') };
}

function renderMemberTitle(member) {
  const displayName = formatDisplayName(member?.name);
  const deceasedSuffix = member?.date_of_death ? ' ז"ל' : '';
  const { firstName, lastName } = splitMemberName(member?.name);

  const firstLineBase = firstName || displayName;
  const secondLineBase = lastName || '';
  const firstLine = deceasedSuffix && !secondLineBase ? `${firstLineBase}${deceasedSuffix}` : firstLineBase;
  const secondLine = deceasedSuffix && secondLineBase ? `${secondLineBase}${deceasedSuffix}` : secondLineBase;

  return (
    <strong className="schematic-mobile-name">
      {firstLine || '\u00A0'}
      <br />
      {secondLine || '\u00A0'}
    </strong>
  );
}

function MemberPhoto({ member }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = resolveMemberImageUrl(member?.image_url);
  const hasImage = imageUrl && !imageFailed;
  const displayName = member?.date_of_death ? `${formatDisplayName(member.name)} ז"ל` : formatDisplayName(member?.name);

  return (
    <span className="schematic-photo-frame">
      {hasImage ? (
        <img
          src={imageUrl}
          alt={`תמונה של ${displayName}`}
          className="schematic-photo"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="schematic-photo-placeholder">{memberInitials(member?.name)}</span>
      )}
    </span>
  );
}

function toCardClass(member, selectedMemberId, kind) {
  const genderClass = isFemale(member) ? 'female' : 'male';
  const activeClass = selectedMemberId === member.id ? 'active' : '';
  return `${kind} ${genderClass} ${activeClass}`.trim();
}

function familyTitle(parents) {
  const names = parents.map((member) => formatDisplayName(member.name)).filter(Boolean);
  if (names.length === 0) return 'משפחה';
  return `משפחת ${names.join(' ו')}`;
}

function BoundedConnectorRow({ className, itemSelector, children }) {
  const rowRef = useRef(null);
  const [lineMetrics, setLineMetrics] = useState({ start: 0, width: 0 });
  const childrenCount = React.Children.count(children);

  const recomputeLineInsets = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const itemClass = itemSelector.startsWith('.') ? itemSelector.slice(1) : itemSelector;
    const items = Array.from(row.children).filter((element) => {
      return element.classList?.contains(itemClass);
    });
    if (items.length === 0) {
      setLineMetrics({ start: 0, width: 0 });
      return;
    }
    const centers = items.map((item) => {
      const anchorCard = item.querySelector('[data-descendant-anchor="true"]');
      if (!anchorCard) return item.offsetLeft + item.offsetWidth / 2;
      const itemRect = item.getBoundingClientRect();
      const anchorRect = anchorCard.getBoundingClientRect();
      const anchorOffset = anchorRect.left + anchorRect.width / 2 - itemRect.left;
      return item.offsetLeft + anchorOffset;
    });
    const start = Math.min(...centers);
    const end = Math.max(...centers);
    const width = Math.max(0, end - start);
    setLineMetrics((prev) => {
      if (Math.abs(prev.start - start) < 0.5 && Math.abs(prev.width - width) < 0.5) {
        return prev;
      }
      return { start, width };
    });
  }, [itemSelector]);

  useLayoutEffect(() => {
    recomputeLineInsets();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return undefined;
    const resizeObserver = new ResizeObserver(() => {
      recomputeLineInsets();
    });
    resizeObserver.observe(row);
    Array.from(row.children).forEach((childEl) => resizeObserver.observe(childEl));
    return () => resizeObserver.disconnect();
  }, [childrenCount, recomputeLineInsets]);

  return (
    <div
      ref={rowRef}
      className={className}
      style={{
        '--row-line-start': `${lineMetrics.start}px`,
        '--row-line-width': `${lineMetrics.width}px`,
      }}
    >
      {children}
    </div>
  );
}

function compareFamilyOrder(a, b) {
  const aGeneration = Math.min(
    ...a.parents
      .map((member) => normalizeGeneration(member.generation))
      .filter((value) => value !== null)
  );
  const bGeneration = Math.min(
    ...b.parents
      .map((member) => normalizeGeneration(member.generation))
      .filter((value) => value !== null)
  );

  const aGen = Number.isFinite(aGeneration) ? aGeneration : 999;
  const bGen = Number.isFinite(bGeneration) ? bGeneration : 999;
  if (aGen !== bGen) return aGen - bGen;

  const aName = a.parents.map((member) => member.name).join(' ');
  const bName = b.parents.map((member) => member.name).join(' ');
  return aName.localeCompare(bName, 'he');
}

function minParentGeneration(family) {
  const generations = family.parents
    .map((member) => normalizeGeneration(member.generation))
    .filter((value) => value !== null);
  if (generations.length === 0) return 999;
  return Math.min(...generations);
}

function anchorGenerationOneParent(family) {
  const generationOneParents = family.parents
    .filter((member) => normalizeGeneration(member.generation) === 1)
    .sort(sortMembers);
  if (generationOneParents.length > 0) return generationOneParents[0];
  return [...family.parents].sort(sortMembers)[0] || null;
}

function isSameDisplayPerson(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return formatDisplayName(a.name) === formatDisplayName(b.name);
}

function orderFamiliesByFounderChildrenAge(families, foundersFamily) {
  const remainingFamilies = new Map(families.map((family) => [family.key, family]));
  const orderedFamilies = [];

  const founderChildren = [...(foundersFamily?.children || [])]
    .map((branch) => branch?.child)
    .filter(Boolean)
    .sort(sortMembers);

  founderChildren.forEach((child) => {
    const match = [...remainingFamilies.values()].find((family) => {
      return family.parents.some((parent) => isSameDisplayPerson(parent, child));
    });
    if (!match) return;
    orderedFamilies.push(match);
    remainingFamilies.delete(match.key);
  });

  const fallbackOrdered = [...remainingFamilies.values()].sort((a, b) => {
    const aAnchor = anchorGenerationOneParent(a);
    const bAnchor = anchorGenerationOneParent(b);
    if (aAnchor && bAnchor) {
      const byAge = sortMembers(aAnchor, bAnchor);
      if (byAge !== 0) return byAge;
    } else if (aAnchor) {
      return -1;
    } else if (bAnchor) {
      return 1;
    }
    return compareFamilyOrder(a, b);
  });

  return [...orderedFamilies, ...fallbackOrdered];
}

function orderFamiliesForMobileDisplay(families) {
  const generationZeroFamilies = families.filter((family) => minParentGeneration(family) === 0);
  const primaryFounderFamily = generationZeroFamilies.length > 0
    ? [...generationZeroFamilies].sort(compareFamilyOrder)[0]
    : null;

  const founderNameSet = new Set(
    (primaryFounderFamily?.parents || [])
      .map((member) => formatDisplayName(member.name))
      .filter(Boolean)
  );

  const anchorForFamily = (family) => {
    const generationOneParents = family.parents
      .filter((member) => normalizeGeneration(member.generation) === 1)
      .sort(sortMembers);

    if (generationOneParents.length === 0) {
      return [...family.parents].sort(sortMembers)[0] || null;
    }

    if (founderNameSet.size > 0) {
      const linked = generationOneParents.find((member) => {
        const fatherName = formatDisplayName(member.father_name);
        const motherName = formatDisplayName(member.mother_name);
        return (fatherName && founderNameSet.has(fatherName)) || (motherName && founderNameSet.has(motherName));
      });
      if (linked) return linked;
    }

    return generationOneParents[0];
  };

  return [...families].sort((a, b) => {
    const aGen = minParentGeneration(a);
    const bGen = minParentGeneration(b);
    if (aGen !== bGen) return aGen - bGen;

    if (aGen === 1 && bGen === 1) {
      const aAnchor = anchorForFamily(a);
      const bAnchor = anchorForFamily(b);
      if (aAnchor && bAnchor) {
        const byAge = sortMembers(aAnchor, bAnchor);
        if (byAge !== 0) return byAge;
      }
    }

    return compareFamilyOrder(a, b);
  });
}

function createPairForMember(member, byId) {
  const spouse = member.spouse_id ? byId[member.spouse_id] : null;
  if (!spouse) return [member];
  const generation = normalizeGeneration(member.generation);
  if (generation !== null && generation >= 1) {
    // For descendants (generation 1+), keep the descendant first (right in RTL),
    // then spouse on the left.
    return [member, spouse];
  }
  return [member, spouse].sort(sortMembers);
}

function pickParentCandidate(candidates, childGeneration) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (typeof childGeneration === 'number') {
    const oneGenerationAbove = candidates.filter((candidate) => {
      return normalizeGeneration(candidate.generation) === childGeneration - 1;
    });
    if (oneGenerationAbove.length === 1) return oneGenerationAbove[0];
    if (oneGenerationAbove.length > 1) return oneGenerationAbove.sort(sortMembers)[0];
  }

  return [...candidates].sort(sortMembers)[0];
}

function orderPairForDisplay(pair, childMemberIds) {
  if (!Array.isArray(pair) || pair.length < 2) return pair;
  const generations = pair
    .map((member) => normalizeGeneration(member.generation))
    .filter((value) => value !== null);
  const minGeneration = generations.length > 0 ? Math.min(...generations) : null;
  if (minGeneration === null || minGeneration < 1) return pair;

  const descendants = pair.filter((member) => childMemberIds.has(member.id));
  if (descendants.length !== 1) return pair;

  const lead = descendants[0];
  return [lead, ...pair.filter((member) => member.id !== lead.id)];
}

export default function FamilySchematicDiagram({
  members,
  selectedMemberId,
  onSelectMember,
  mobileCompact = false,
  showViewSwitch = true,
  diagramMode: controlledDiagramMode,
  onDiagramModeChange,
}) {
  const isControlledDiagramMode = typeof controlledDiagramMode === 'string' && controlledDiagramMode.length > 0;
  const [internalDiagramMode, setInternalDiagramMode] = useState('classic');
  const diagramMode = isControlledDiagramMode ? controlledDiagramMode : internalDiagramMode;
  const setDiagramMode = useCallback(
    (nextMode) => {
      if (isControlledDiagramMode) {
        onDiagramModeChange?.(nextMode);
        return;
      }
      setInternalDiagramMode(nextMode);
    },
    [isControlledDiagramMode, onDiagramModeChange]
  );
  const treeContainerRef = useRef(null);
  const classicViewLabel = mobileCompact ? 'אנכי' : 'מרשם קיים';
  const verticalViewLabel = mobileCompact ? 'אופקי' : 'מרשם גדול אנכי';

  const sourceMembers = useMemo(() => {
    return members && members.length > 0 ? members : RESOLVED_FAMILY_MEMBERS_SEED;
  }, [members]);

  const visibleMembers = useMemo(() => {
    const filtered = sourceMembers.filter((member) => member.generation !== -1);
    return filtered.length > 0 ? filtered : sourceMembers;
  }, [sourceMembers]);

  const { members: diagramMembers, aliasToPrimary } = useMemo(() => {
    return mergeEquivalentMembers(visibleMembers);
  }, [visibleMembers]);

  const diagramSelectedMemberId = useMemo(() => {
    return aliasToPrimary[selectedMemberId] || selectedMemberId;
  }, [aliasToPrimary, selectedMemberId]);

  const membersById = useMemo(() => {
    return Object.fromEntries(diagramMembers.map((member) => [member.id, member]));
  }, [diagramMembers]);

  const membersByName = useMemo(() => {
    const map = new Map();
    diagramMembers.forEach((member) => {
      const key = normalizeName(member.name);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(member);
    });
    return map;
  }, [diagramMembers]);

  const resolveParentsForMember = useCallback((member) => {
    const resolved = [];
    const pushUnique = (candidate) => {
      if (!candidate) return;
      if (!resolved.some((existing) => existing.id === candidate.id)) {
        resolved.push(candidate);
      }
    };

    if (member.father_id) {
      pushUnique(membersById[member.father_id]);
    } else {
      const fatherCandidates = membersByName.get(normalizeName(member.father_name)) || [];
      pushUnique(pickParentCandidate(fatherCandidates, normalizeGeneration(member.generation)));
    }

    if (member.mother_id) {
      pushUnique(membersById[member.mother_id]);
    } else {
      const motherCandidates = membersByName.get(normalizeName(member.mother_name)) || [];
      pushUnique(pickParentCandidate(motherCandidates, normalizeGeneration(member.generation)));
    }

    return resolved.sort(sortMembers);
  }, [membersById, membersByName]);

  const families = useMemo(() => {
    const familyMap = new Map();

    for (const child of diagramMembers) {
      const parents = resolveParentsForMember(child);

      if (parents.length === 0) continue;

      const key = parents.map((member) => member.id).sort().join('|');
      if (!familyMap.has(key)) {
        familyMap.set(key, {
          key,
          parents,
          children: new Map(),
        });
      }
      familyMap.get(key).children.set(child.id, child);
    }

    let resolved = [...familyMap.values()].map((family) => {
      const children = [...family.children.values()].sort(sortMembers).map((child) => {
        const pair = createPairForMember(child, membersById);
        const grandchildrenMap = new Map();

        diagramMembers.forEach((member) => {
          const resolvedParents = resolveParentsForMember(member);
          const isChildOfPair = resolvedParents.some((resolvedParent) => {
            return pair.some((pairParent) => pairParent.id === resolvedParent.id);
          });
          if (isChildOfPair) {
            grandchildrenMap.set(member.id, member);
          }
        });

        return {
          child,
          pair,
          grandchildren: [...grandchildrenMap.values()].sort(sortMembers),
        };
      });

      return {
        key: family.key,
        parents: family.parents,
        children,
      };
    });

    const childMemberIds = new Set();
    resolved.forEach((family) => {
      family.children.forEach((branch) => {
        childMemberIds.add(branch.child.id);
      });
    });

    let rootFamilies = [];
    const generationZeroFamilies = resolved.filter((family) => minParentGeneration(family) === 0);
    const generationOneFamilies = resolved.filter((family) => minParentGeneration(family) === 1);

    if (generationZeroFamilies.length > 0 && generationOneFamilies.length > 0) {
      const foundersFamily = [...generationZeroFamilies].sort(compareFamilyOrder)[0];
      const foundersHeader = {
        ...foundersFamily,
        key: 'founders_' + foundersFamily.key,
        children: [],
        isFoundersHeader: true,
      };

      const orderedChildrenFamilies = orderFamiliesByFounderChildrenAge(
        generationOneFamilies,
        foundersFamily
      );

      rootFamilies = [foundersHeader, ...orderedChildrenFamilies];
    } else if (generationOneFamilies.length > 0) {
      // Prefer generation-1 families as the starting layer so generation-3 children
      // are rendered directly under their generation-2 parents (e.g. אלדד טל -> שני/נוי/אור).
      rootFamilies = [...generationOneFamilies].sort(compareFamilyOrder);
    } else {
      // Fallback: keep only true roots to avoid duplicate blocks.
      rootFamilies = resolved.filter((family) => {
        return family.parents.every((parent) => !childMemberIds.has(parent.id));
      });
    }

    if (resolved.length === 0) {
      rootFamilies = createSpousePairs(diagramMembers).map((pair, index) => ({
        key: `fallback_${index}`,
        parents: pair,
        children: [],
      }));
    }

    if (rootFamilies.length === 0) {
      rootFamilies = resolved;
    }

    const preferredFamilies = rootFamilies.map((family) => ({
      ...family,
      parents: toPreferredDisplayPair(orderPairForDisplay(family.parents, childMemberIds), membersById),
    }));

    const mergedByPair = new Map();
    preferredFamilies.forEach((family) => {
      const pairKey = family.parents.map((member) => member.id).sort().join('|') || family.key;
      const normalizedChildren = (family.children || []).map((branch) => ({
        ...branch,
        pair: toPreferredDisplayPair(branch.pair, membersById),
        grandchildren: [...(branch.grandchildren || [])].sort(sortMembers),
      }));

      if (!mergedByPair.has(pairKey)) {
        mergedByPair.set(pairKey, {
          ...family,
          key: pairKey,
          children: normalizedChildren,
          isFoundersHeader: Boolean(family.isFoundersHeader),
        });
        return;
      }

      const existing = mergedByPair.get(pairKey);
      const branchByChild = new Map();

      (existing.children || []).forEach((branch) => {
        branchByChild.set(branch.child.id, {
          ...branch,
          pair: toPreferredDisplayPair(branch.pair, membersById),
          grandchildren: [...(branch.grandchildren || [])],
        });
      });

      normalizedChildren.forEach((branch) => {
        const current = branchByChild.get(branch.child.id);
        if (!current) {
          branchByChild.set(branch.child.id, branch);
          return;
        }

        const grandchildMap = new Map();
        [...(current.grandchildren || []), ...(branch.grandchildren || [])].forEach((member) => {
          grandchildMap.set(member.id, member);
        });
        current.grandchildren = [...grandchildMap.values()].sort(sortMembers);
      });

      existing.children = [...branchByChild.values()].sort((a, b) => sortMembers(a.child, b.child));
      existing.isFoundersHeader = Boolean(existing.isFoundersHeader || family.isFoundersHeader);
    });

    if (mobileCompact) {
      return orderFamiliesForMobileDisplay([...mergedByPair.values()]);
    }

    return [...mergedByPair.values()];
  }, [diagramMembers, membersById, resolveParentsForMember, mobileCompact]);

  useLayoutEffect(() => {
    if (diagramMode !== 'classic' || !diagramSelectedMemberId) return undefined;
    const container = treeContainerRef.current;
    if (!container) return undefined;

    const centerActiveMember = () => {
      const activeCard = container.querySelector('.schematic-person-card.active, .schematic-child-card.active');
      if (!activeCard) return;

      const focusTarget = activeCard.querySelector('.schematic-photo-frame') || activeCard;
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      const containerRect = container.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();
      const deltaX = cardRect.left + cardRect.width / 2 - (containerRect.left + containerRect.width / 2);
      const deltaY = cardRect.top + cardRect.height / 2 - (containerRect.top + containerRect.height / 2);
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      container.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
    };

    let rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(centerActiveMember);
    });
    const timeoutId = window.setTimeout(centerActiveMember, 90);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [diagramMode, diagramSelectedMemberId, families.length]);

  useLayoutEffect(() => {
    if (diagramMode !== 'classic') return undefined;
    const container = treeContainerRef.current;
    if (!container) return undefined;

    const updateBranchStemAnchors = () => {
      const branches = Array.from(container.querySelectorAll('.schematic-branch'));
      branches.forEach((branchElement) => {
        const anchorCard = branchElement.querySelector('.schematic-pair-head [data-descendant-anchor="true"]');
        if (!anchorCard) {
          branchElement.style.removeProperty('--branch-stem-left');
          return;
        }
        const branchRect = branchElement.getBoundingClientRect();
        const anchorRect = anchorCard.getBoundingClientRect();
        const anchorCenter = anchorRect.left + anchorRect.width / 2 - branchRect.left;
        branchElement.style.setProperty('--branch-stem-left', `${anchorCenter}px`);
      });
    };

    updateBranchStemAnchors();
    const onResize = () => updateBranchStemAnchors();
    window.addEventListener('resize', onResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateBranchStemAnchors();
      });
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
      const branches = Array.from(container.querySelectorAll('.schematic-branch'));
      branches.forEach((branchElement) => branchElement.style.removeProperty('--branch-stem-left'));
    };
  }, [diagramMode, families.length]);

  if (diagramMembers.length === 0) {
    return <p className="muted">אין נתונים להצגת מרשם סכימתי.</p>;
  }

  return (
    <div className={mobileCompact ? `schematic-tree schematic-mobile-compact schematic-mode-${diagramMode}` : "schematic-tree"} ref={treeContainerRef}>
      {(!members || members.length === 0) && (
        <p className="tree-diagram-help">
          מציג כרגע נתוני גיבוי מהקובץ משפחת_טל.xlsx, כי לא נטענו נתוני FamilyMember מהשרת.
        </p>
      )}

      {showViewSwitch && (
        <div className="schematic-view-switch">
          <button
            type="button"
            className={diagramMode === 'classic' ? 'schematic-view-btn active' : 'schematic-view-btn'}
            onClick={() => setDiagramMode('classic')}
          >
            {classicViewLabel}
          </button>
          <button
            type="button"
            className={diagramMode === 'canvasVertical' ? 'schematic-view-btn active' : 'schematic-view-btn'}
            onClick={() => setDiagramMode('canvasVertical')}
          >
            {verticalViewLabel}
          </button>
        </div>
      )}

      {diagramMode === 'canvasVertical' ? (
        <FamilySchematicCanvasVertical
          members={diagramMembers}
          selectedMemberId={diagramSelectedMemberId}
          onSelectMember={onSelectMember}
          mobileCompact={mobileCompact}
        />
      ) : (
        families.map((family) => (
          <section
            className={`schematic-family-block${family.isFoundersHeader ? ' schematic-family-block-founders' : ''}`}
            key={family.key}
          >
            <div className="schematic-title-wrap">
              <h4 className="schematic-title-pill">{familyTitle(family.parents)}</h4>
            </div>

            <div className="schematic-family-head">
              {getSecondarySpousesForLead(family.parents, membersById).map((spouse) => (
                <React.Fragment key={`secondary_family_${family.key}_${spouse.id}`}>
                  <button
                    type="button"
                    className={toCardClass(spouse, diagramSelectedMemberId, 'schematic-person-card')}
                    onClick={() => onSelectMember && onSelectMember(spouse.id)}
                  >
                    <MemberPhoto member={spouse} />
                    {renderMemberTitle(spouse)}
                  </button>
                  <span className="schematic-spouse-dash" />
                </React.Fragment>
              ))}
              {family.parents.map((member, index) => (
                <React.Fragment key={member.id}>
                  <button
                    type="button"
                    className={toCardClass(member, diagramSelectedMemberId, 'schematic-person-card')}
                    onClick={() => onSelectMember && onSelectMember(member.id)}
                  >
                    <MemberPhoto member={member} />
                    {renderMemberTitle(member)}
                  </button>
                  {index === 0 && family.parents.length > 1 && <span className="schematic-heart">♡</span>}
                </React.Fragment>
              ))}
            </div>

            {family.children.length > 0 && (
              <>
                <div className="schematic-parent-stem" />
                <BoundedConnectorRow className="schematic-branches-row" itemSelector=".schematic-branch">
                  {family.children.map((branch) => (
                    <article className="schematic-branch" key={branch.child.id}>
                      <div className="schematic-pair-head">
                        {getSecondarySpousesForLead(branch.pair, membersById).map((spouse) => (
                          <React.Fragment key={`secondary_branch_${branch.child.id}_${spouse.id}`}>
                            <button
                              type="button"
                              className={toCardClass(spouse, diagramSelectedMemberId, 'schematic-child-card') }
                              onClick={() => onSelectMember && onSelectMember(spouse.id)}
                            >
                              <MemberPhoto member={spouse} />
                              {renderMemberTitle(spouse)}
                            </button>
                            <span className="schematic-spouse-dash" />
                          </React.Fragment>
                        ))}
                        {branch.pair.map((member, index) => (
                          <React.Fragment key={member.id}>
                            <button
                              type="button"
                              className={toCardClass(member, diagramSelectedMemberId, 'schematic-child-card')}
                              data-descendant-anchor={index === 0 ? 'true' : undefined}
                              onClick={() => onSelectMember && onSelectMember(member.id)}
                            >
                              <MemberPhoto member={member} />
                              {renderMemberTitle(member)}
                            </button>
                            {index === 0 && branch.pair.length > 1 && <span className="schematic-heart">♡</span>}
                          </React.Fragment>
                        ))}
                      </div>

                      {branch.grandchildren.length > 0 && (
                        <>
                          <div className="schematic-branch-stem" />
                          <BoundedConnectorRow
                            className="schematic-grandchildren-row"
                            itemSelector=".schematic-child-card"
                          >
                            {branch.grandchildren.map((grandchild) => (
                              <button
                                type="button"
                                key={grandchild.id}
                                className={toCardClass(grandchild, diagramSelectedMemberId, 'schematic-child-card')}
                                onClick={() => onSelectMember && onSelectMember(grandchild.id)}
                              >
                                <MemberPhoto member={grandchild} />
                                {renderMemberTitle(grandchild)}
                              </button>
                            ))}
                          </BoundedConnectorRow>
                        </>
                      )}
                    </article>
                  ))}
                </BoundedConnectorRow>
              </>
            )}
          </section>
        ))
      )}
    </div>
  );
}
