import React, { useMemo } from 'react';
import { RESOLVED_FAMILY_MEMBERS_SEED } from '@/data/familyMembersResolvedSeed';

function normalizeGeneration(generation) {
  if (generation === null || generation === undefined || generation === '') return null;
  const parsed = Number(generation);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortMembers(a, b) {
  if (a.birth_date && b.birth_date) {
    const dateDiff = new Date(a.birth_date) - new Date(b.birth_date);
    if (dateDiff !== 0) return dateDiff;
  }

  if (a.birth_year && b.birth_year) {
    const yearDiff = Number(a.birth_year) - Number(b.birth_year);
    if (yearDiff !== 0) return yearDiff;
  }

  return String(a.name || '').localeCompare(String(b.name || ''), 'he');
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

function getChildrenForPair(pair, members) {
  const parentIds = pair.map((parent) => parent.id);
  const unique = new Map();

  for (const member of members) {
    if (member.generation === -1) continue;

    const matchesFather = member.father_id && parentIds.includes(member.father_id);
    const matchesMother = member.mother_id && parentIds.includes(member.mother_id);

    if (matchesFather || matchesMother) {
      unique.set(member.id, member);
    }
  }

  return [...unique.values()].sort(sortMembers);
}

function formatGenerationLabel(generation) {
  if (generation === null) return 'ללא דור מוגדר';
  if (generation === -1) return 'דור חיצוני';
  if (generation === 0) return 'דור המייסדים';
  return `דור ${generation}`;
}

export default function FamilyTreeDiagram({ members, selectedMemberId, onSelectMember }) {
  const sourceMembers = useMemo(() => {
    return members && members.length > 0 ? members : RESOLVED_FAMILY_MEMBERS_SEED;
  }, [members]);

  const visibleMembers = useMemo(() => {
    const filtered = sourceMembers.filter((member) => member.generation !== -1);
    return filtered.length > 0 ? filtered : sourceMembers;
  }, [sourceMembers]);

  const generations = useMemo(() => {
    const grouped = new Map();

    for (const member of visibleMembers) {
      const generation = normalizeGeneration(member.generation);
      const key = generation === null ? 999 : generation;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(member);
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, generationMembers]) => {
        const labelGeneration = key === 999 ? null : key;
        return {
          generation: labelGeneration,
          label: formatGenerationLabel(labelGeneration),
          pairs: createSpousePairs(generationMembers),
        };
      });
  }, [visibleMembers]);

  if (visibleMembers.length === 0) {
    return <p className="muted">אין נתונים להצגת תרשים.</p>;
  }

  return (
    <div className="tree-diagram">
      <p className="tree-diagram-help">התרשים מבוסס על השדות: father_id, mother_id, spouse_id.</p>
      {(!members || members.length === 0) && (
        <p className="tree-diagram-help">
          מציג כרגע נתוני גיבוי מהקובץ משפחת_טל.xlsx, כי לא נטענו נתוני FamilyMember מהשרת.
        </p>
      )}

      {generations.map((generationBlock) => (
        <section className="tree-generation" key={String(generationBlock.generation)}>
          <h4>{generationBlock.label}</h4>

          <div className="tree-pairs-grid">
            {generationBlock.pairs.map((pair) => {
              const pairKey = pair.map((member) => member.id).join('-');
              const children = getChildrenForPair(pair, visibleMembers);

              return (
                <article className="tree-pair-card" key={pairKey}>
                  <div className="tree-pair-head">
                    {pair.map((member, index) => (
                      <React.Fragment key={member.id}>
                        {index > 0 && <span className="tree-heart">❤</span>}
                        <button
                          type="button"
                          className={selectedMemberId === member.id ? 'tree-person active' : 'tree-person'}
                          onClick={() => onSelectMember && onSelectMember(member.id)}
                        >
                          {member.date_of_death ? `${member.name} ז"ל` : member.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="tree-children">
                    <p>ילדים ({children.length})</p>
                    {children.length === 0 ? (
                      <span className="tree-empty">אין רשומות ילדים מקושרות</span>
                    ) : (
                      <div className="tree-children-list">
                        {children.map((child) => (
                          <button
                            type="button"
                            key={child.id}
                            className={selectedMemberId === child.id ? 'tree-child-chip active' : 'tree-child-chip'}
                            onClick={() => onSelectMember && onSelectMember(child.id)}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
