import React, { useEffect, useMemo, useState } from 'react';
import FamilySchematicDiagram from '@/components/FamilySchematicDiagram';
import FamilyWorldMap from '@/components/FamilyWorldMap';
import { RESOLVED_FAMILY_MEMBERS_SEED } from '@/data/familyMembersResolvedSeed';
import { formatDisplayName } from '@/lib/displayName';
import { applyMemberImageFallbacks, resolveMemberImageUrl } from '@/lib/memberImageFallbacks';
import { Bell, GitBranch, MapPinned, Search, UserRound, Users } from 'lucide-react';

const LOCAL_MEMBERS_STORAGE_KEY = 'codeTAL2_local_members_v2';
const LOCAL_MEMBERS_SOURCE_VERSION = 'xlsx_2026_05_17_r2';
const MOBILE_BREAKPOINT_PX = 960;

function getEffectiveViewportWidth() {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;

  const layoutWidth = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
  const visualWidth = Number(window.visualViewport?.width) || Number.POSITIVE_INFINITY;

  return Math.min(layoutWidth, visualWidth);
}

function detectMobileViewport() {
  if (typeof window === 'undefined') return false;

  const byMatchMedia = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)?.matches;
  if (byMatchMedia) return true;

  return getEffectiveViewportWidth() <= MOBILE_BREAKPOINT_PX;
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

function parseStoredMembers(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.members)) return null;
    const members = parsed.members
      .filter((item) => item && typeof item === 'object' && item.id && item.name)
      .map((item) => ({ ...item }));
    return {
      sourceVersion: parsed.sourceVersion || null,
      members,
    };
  } catch {
    return null;
  }
}

function toShortDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years >= 0 ? years : null;
}

function getNextAnnualDate(dateString) {
  if (!dateString) return null;
  const original = new Date(dateString);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const next = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  next.setHours(0, 0, 0, 0);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next.setFullYear(now.getFullYear() + 1);

  return next;
}

function getCurrentMonthAnnualDate(dateString) {
  if (!dateString) return null;
  const original = new Date(dateString);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const thisYearDate = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  thisYearDate.setHours(0, 0, 0, 0);
  if (thisYearDate.getMonth() !== now.getMonth()) return null;
  return thisYearDate;
}

function diffDays(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getUpcomingEvents(members) {
  const events = [];
  const anniversaryKeys = new Set();

  members
    .filter((member) => member.generation !== -1 && !member.date_of_death)
    .forEach((member) => {
      const birthEventDate = getCurrentMonthAnnualDate(member.birth_date);
      const birthInDays = diffDays(birthEventDate);
      if (birthInDays !== null) {
        events.push({
          id: `${member.id}_birthday`,
          type: 'birthday',
          name: formatDisplayName(member.name),
          date: birthEventDate,
          inDays: birthInDays,
        });
      }

      const weddingEventDate = getCurrentMonthAnnualDate(member.wedding_date);
      const weddingInDays = diffDays(weddingEventDate);
      if (weddingInDays !== null) {
        const spouseLabel = member.spouse_name ? formatDisplayName(member.spouse_name) : '';
        const weddingKey = member.spouse_id
          ? [member.id, member.spouse_id].sort().join('|')
          : [formatDisplayName(member.name), spouseLabel].sort().join('|');
        if (anniversaryKeys.has(weddingKey)) return;
        anniversaryKeys.add(weddingKey);

        events.push({
          id: `${member.id}_anniversary`,
          type: 'anniversary',
          name: `${formatDisplayName(member.name)}${spouseLabel ? ` ו${spouseLabel}` : ''}`,
          date: weddingEventDate,
          inDays: weddingInDays,
        });
      }
    });

  return events.sort((a, b) => a.date - b.date);
}

function rowSubtitle(member) {
  const relationBits = [];
  if (member.generation !== null && member.generation !== undefined) relationBits.push(`דור ${member.generation}`);
  if (member.city) relationBits.push(member.city);
  if (member.father_name) relationBits.push(`בן: ${formatDisplayName(member.father_name)}`);
  if (member.mother_name) relationBits.push(`בת: ${formatDisplayName(member.mother_name)}`);
  return relationBits.join(' • ') || 'ללא פרטים נוספים';
}

function mobileParentsSubtitle(member) {
  const father = formatDisplayName(member.father_name);
  const mother = formatDisplayName(member.mother_name);
  const gender = String(member.gender || '').trim().toLowerCase();
  const isFemale = ['נקבה', 'female', 'f', 'woman', 'אשה', 'אישה'].includes(gender);
  const relationWord = isFemale ? 'בת' : 'בן';

  if (father && mother) return `${relationWord} ${father} ו${mother}`;
  if (father) return `${relationWord} ${father}`;
  if (mother) return `${relationWord} ${mother}`;
  return 'ללא פרטי הורים';
}

function formatInDaysLabel(inDays) {
  if (inDays === 0) return 'היום';
  if (inDays > 0) return `בעוד ${inDays} ימים`;
  return `לפני ${Math.abs(inDays)} ימים`;
}

function initials(name) {
  const words = String(formatDisplayName(name) || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '👤';
  return words.slice(0, 2).map((part) => part[0]).join('');
}

export default function AppTestDesktop() {
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuTab, setActiveMenuTab] = useState(() => (detectMobileViewport() ? 'people' : 'map'));
  const [isMobileViewport, setIsMobileViewport] = useState(() => detectMobileViewport());

  useEffect(() => {
    const storedPayload = parseStoredMembers(window.localStorage.getItem(LOCAL_MEMBERS_STORAGE_KEY));
    if (
      storedPayload &&
      storedPayload.sourceVersion === LOCAL_MEMBERS_SOURCE_VERSION &&
      storedPayload.members.length > 0
    ) {
      setMembers(applyMemberImageFallbacks(storedPayload.members));
      return;
    }
    setMembers(applyMemberImageFallbacks(RESOLVED_FAMILY_MEMBERS_SEED.map((member) => ({ ...member }))));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setIsMobileViewport(detectMobileViewport());
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (activeMenuTab === 'tree' || activeMenuTab === 'people' || activeMenuTab === 'map' || activeMenuTab === 'updates') return;
    setActiveMenuTab('people');
  }, [activeMenuTab, isMobileViewport]);

  const treeMembers = useMemo(() => {
    return members
      .filter((member) => member.generation !== -1)
      .sort((a, b) => {
        const genA = Number.isFinite(Number(a.generation)) ? Number(a.generation) : 99;
        const genB = Number.isFinite(Number(b.generation)) ? Number(b.generation) : 99;
        if (genA !== genB) return genA - genB;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });
  }, [members]);

  const membersById = useMemo(() => {
    return Object.fromEntries(treeMembers.map((member) => [member.id, member]));
  }, [treeMembers]);

  const filteredMembers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return treeMembers;
    return treeMembers.filter((member) => {
      return [member.name, member.city, member.spouse_name, member.father_name, member.mother_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [searchTerm, treeMembers]);

  useEffect(() => {
    if (!selectedMemberId && treeMembers.length > 0) {
      setSelectedMemberId(treeMembers[0].id);
      return;
    }
    if (selectedMemberId && !treeMembers.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(treeMembers[0]?.id || '');
    }
  }, [selectedMemberId, treeMembers]);

  const selectedMember = useMemo(() => {
    return treeMembers.find((member) => member.id === selectedMemberId) || null;
  }, [treeMembers, selectedMemberId]);
  const selectedMemberImageUrl = resolveMemberImageUrl(selectedMember?.image_url);

  const selectedChildren = useMemo(() => {
    if (!selectedMember) return [];
    const selectedName = normalizeName(selectedMember.name);
    return treeMembers.filter((member) => {
      if (member.id === selectedMember.id) return false;
      if (member.father_id === selectedMember.id || member.mother_id === selectedMember.id) return true;
      return (
        normalizeName(member.father_name) === selectedName ||
        normalizeName(member.mother_name) === selectedName
      );
    });
  }, [selectedMember, treeMembers]);

  const upcomingEvents = useMemo(() => getUpcomingEvents(treeMembers), [treeMembers]);
  const birthdayEvents = useMemo(
    () => upcomingEvents.filter((eventItem) => eventItem.type === 'birthday'),
    [upcomingEvents]
  );
  const anniversaryEvents = useMemo(
    () => upcomingEvents.filter((eventItem) => eventItem.type === 'anniversary'),
    [upcomingEvents]
  );
  const showingMap = activeMenuTab === 'map';
  const menuItems = [
    { id: 'tree', label: 'עץ משפחה', icon: GitBranch },
    { id: 'people', label: 'אנשים', icon: Users },
    { id: 'updates', label: 'עדכונים', icon: Bell },
    { id: 'map', label: 'מפה', icon: MapPinned },
    { id: 'settings', label: 'הגדרות', icon: UserRound },
  ];
  const mobileMenuItems = [
    { id: 'tree', label: 'עץ', icon: GitBranch, enabled: true },
    { id: 'people', label: 'אנשים', icon: Users, enabled: true },
    { id: 'updates', label: 'עדכונים', icon: Bell, enabled: true },
    { id: 'map', label: 'מפה', icon: MapPinned, enabled: true },
    { id: 'settings', label: 'הגדרות', icon: UserRound, enabled: false },
  ];

  const mobileHeaderTitle = useMemo(() => {
    if (activeMenuTab === 'tree') return 'מרשם קיים';
    if (activeMenuTab === 'people') return 'אנשים';
    if (activeMenuTab === 'updates') return 'עדכונים';
    if (activeMenuTab === 'map') return 'מפה';
    return 'משפחת כהן';
  }, [activeMenuTab]);

  const renderListAvatar = (member) => {
    const imageUrl = resolveMemberImageUrl(member?.image_url);
    if (imageUrl) {
      return (
        <img
          className="test-mobile-avatar-image"
          src={imageUrl}
          alt={formatDisplayName(member.name)}
          loading="lazy"
        />
      );
    }
    return <span className="test-mobile-avatar-fallback">{initials(member.name)}</span>;
  };

  if (isMobileViewport) {
    const showTreeScreen = activeMenuTab === 'tree';
    const showPeopleScreen = activeMenuTab === 'people';
    const showMapScreen = activeMenuTab === 'map';
    const showUpdatesScreen = activeMenuTab === 'updates';

    return (
      <div className="test-page test-mobile-page" dir="rtl">
        <header className="test-mobile-header">
          <h1>{mobileHeaderTitle}</h1>
          <button
            type="button"
            className="test-mobile-header-icon"
            aria-label="חיפוש"
            onClick={() => setActiveMenuTab('people')}
          >
            <Search size={26} strokeWidth={2.1} />
          </button>
        </header>

        <main className="test-mobile-main">
          {showTreeScreen && (
            <section className="test-mobile-screen test-mobile-tree-screen">
              <FamilySchematicDiagram
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
                mobileCompact
              />
            </section>
          )}

          {showPeopleScreen && (
            <section className="test-mobile-screen">
              <div className="test-mobile-search-wrap">
                <span className="test-mobile-search-icon">
                  <Search size={21} strokeWidth={2} />
                </span>
                <input
                  type="search"
                  className="test-mobile-search-input"
                  placeholder="חיפוש..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="test-mobile-member-list">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={selectedMemberId === member.id ? 'test-mobile-member-row active' : 'test-mobile-member-row'}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <span className="test-mobile-avatar">{renderListAvatar(member)}</span>
                    <span className="test-mobile-member-meta">
                      <strong>{formatDisplayName(member.name)}</strong>
                      <small>{mobileParentsSubtitle(member)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showMapScreen && (
            <section className="test-mobile-screen test-mobile-map-screen">
              <FamilyWorldMap
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
              />
            </section>
          )}

          {showUpdatesScreen && (
            <section className="test-mobile-screen test-mobile-updates-screen">
              <div className="test-mobile-updates-list">
                <article className="test-update-item">
                  <strong>ימי הולדת</strong>
                  {birthdayEvents.length === 0 ? (
                    <p className="test-update-empty">אין ימי הולדת בחודש הנוכחי.</p>
                  ) : (
                    <div className="test-update-group-list">
                      {birthdayEvents.map((eventItem) => (
                        <div key={eventItem.id} className="test-update-row">
                          <span className="test-update-name">{eventItem.name}</span>
                          <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                          <small className="test-update-days">{formatInDaysLabel(eventItem.inDays)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="test-update-item">
                  <strong>ימי נישואין</strong>
                  {anniversaryEvents.length === 0 ? (
                    <p className="test-update-empty">אין ימי נישואין בחודש הנוכחי.</p>
                  ) : (
                    <div className="test-update-group-list">
                      {anniversaryEvents.map((eventItem) => (
                        <div key={eventItem.id} className="test-update-row">
                          <span className="test-update-name">{eventItem.name}</span>
                          <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                          <small className="test-update-days">{formatInDaysLabel(eventItem.inDays)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}
        </main>

        <nav className="test-mobile-bottom-nav" aria-label="תפריט מובייל">
          {mobileMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenuTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={isActive ? 'test-mobile-nav-btn active' : 'test-mobile-nav-btn'}
                onClick={() => item.enabled && setActiveMenuTab(item.id)}
                disabled={!item.enabled}
              >
                <Icon size={20} strokeWidth={2.1} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="test-page" dir="rtl">
      <header className="test-topbar">
        <div className="test-topbar-brand">
          <h1>משפחת כהן</h1>
          <p>index-test | תצוגת דסקטופ מותאמת</p>
        </div>

        <div className="test-topbar-main">
          <nav className="test-topbar-menu" aria-label="תפריט ראשי">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={activeMenuTab === item.id ? 'test-menu-btn active' : 'test-menu-btn'}
                  onClick={() => setActiveMenuTab(item.id)}
                >
                  <span className="test-menu-btn-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2.1} />
                  </span>
                  <span className="test-menu-btn-label">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <label className="test-topbar-search">
            <input
              type="search"
              placeholder="חיפוש שם, קשר, עיר..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className="test-desktop-scroll">
        <section className="test-desktop-grid">
          <section className="test-people-stack-col">
            <section className="test-panel test-members-col">
              <div className="test-panel-head">
                <h3>בני המשפחה ({filteredMembers.length})</h3>
              </div>
              <div className="test-member-list">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    className={selectedMemberId === member.id ? 'test-member-row active' : 'test-member-row'}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <span className="test-avatar">{initials(member.name)}</span>
                    <span className="test-member-meta">
                      <strong>{formatDisplayName(member.name)}</strong>
                      <small>{mobileParentsSubtitle(member)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="test-panel test-selected-col">
              <div className="test-panel-head">
                <h3>כרטיס בן משפחה</h3>
              </div>
              {selectedMember ? (
                <div className="test-member-card">
                  <div className="test-member-card-header">
                    <div className="test-member-card-title">
                      <h2>{formatDisplayName(selectedMember.name)}</h2>
                      <p>{selectedMember.gender || 'ללא מין'} • דור {selectedMember.generation ?? '-'}</p>
                    </div>
                    <span className="test-member-photo-frame">
                      {selectedMemberImageUrl ? (
                        <img
                          className="test-member-photo"
                          src={selectedMemberImageUrl}
                          alt={formatDisplayName(selectedMember.name)}
                          loading="lazy"
                        />
                      ) : (
                        <span className="test-member-photo-placeholder">{initials(selectedMember.name)}</span>
                      )}
                    </span>
                  </div>
                  <ul>
                    <li>גיל: {getAge(selectedMember.birth_date) ?? '-'}</li>
                    <li>תאריך לידה: {toShortDate(selectedMember.birth_date)}</li>
                    <li>טלפון: {selectedMember.phone_number || '-'}</li>
                    <li>אימייל: {selectedMember.email || '-'}</li>
                    <li>עיר: {selectedMember.city || '-'}</li>
                    <li>
                      בן/בת זוג:{' '}
                      {selectedMember.spouse_id
                        ? formatDisplayName(membersById[selectedMember.spouse_id]?.name || selectedMember.spouse_name) || '-'
                        : formatDisplayName(selectedMember.spouse_name) || '-'}
                    </li>
                    <li>ילדים: {selectedChildren.map((child) => formatDisplayName(child.name)).join(', ') || '-'}</li>
                  </ul>
                </div>
              ) : (
                <p className="test-empty">בחר בן משפחה מהרשימה.</p>
              )}
            </section>
          </section>

          <section className="test-panel test-schematic-col">
            <div className="test-panel-head">
              <h3>{showingMap ? 'מפת Shortbread (חינמי)' : 'תרשים סכמתי'}</h3>
            </div>
            {showingMap ? (
              <FamilyWorldMap
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
              />
            ) : (
              <FamilySchematicDiagram
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
              />
            )}
          </section>

          <aside className="test-panel test-updates-col">
            <div className="test-panel-head">
              <h3>הודעות ועדכונים</h3>
            </div>
            <div className="test-updates-list">
              {upcomingEvents.length === 0 ? (
                <p className="test-empty">אין עדכונים קרובים.</p>
              ) : (
                <>
                  <article className="test-update-item">
                    <strong>ימי הולדת</strong>
                    {birthdayEvents.length === 0 ? (
                      <p className="test-update-empty">אין ימי הולדת קרובים.</p>
                    ) : (
                      <div className="test-update-group-list">
                        {birthdayEvents.map((eventItem) => (
                          <div key={eventItem.id} className="test-update-row">
                            <span className="test-update-name">{eventItem.name}</span>
                            <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                            <small className="test-update-days">
                              {formatInDaysLabel(eventItem.inDays)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  <article className="test-update-item">
                    <strong>ימי נישואין</strong>
                    {anniversaryEvents.length === 0 ? (
                      <p className="test-update-empty">אין ימי נישואין קרובים.</p>
                    ) : (
                      <div className="test-update-group-list">
                        {anniversaryEvents.map((eventItem) => (
                          <div key={eventItem.id} className="test-update-row">
                            <span className="test-update-name">{eventItem.name}</span>
                            <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                            <small className="test-update-days">
                              {formatInDaysLabel(eventItem.inDays)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </>
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
