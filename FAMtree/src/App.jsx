import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import FamilyTreeDiagram from '@/components/FamilyTreeDiagram';
import FamilySchematicDiagram from '@/components/FamilySchematicDiagram';
import { RESOLVED_FAMILY_MEMBERS_SEED } from '@/data/familyMembersResolvedSeed';
import { formatDisplayName } from '@/lib/displayName';
import { applyMemberImageFallbacks, resolveMemberImageUrl } from '@/lib/memberImageFallbacks';

const EMPTY_MEMBER_FORM = {
  name: '',
  gender: 'זכר',
  generation: '',
  father_id: '',
  father_name: '',
  mother_id: '',
  mother_name: '',
  spouse_id: '',
  spouse_name: '',
  birth_date: '',
  date_of_death: '',
  wedding_date: '',
  phone_number: '',
  email: '',
  city: '',
  neighborhood: '',
  street: '',
  house_number: '',
  image_url: '',
  notes: '',
};

const GENDER_OPTIONS = ['זכר', 'נקבה', 'male', 'female', 'לא ידוע'];
const LOCAL_MEMBERS_STORAGE_KEY = 'codeTAL2_local_members_v2';
const LOCAL_MEMBERS_SOURCE_VERSION = 'xlsx_2026_05_17_r2';
const LOCAL_MODE_QUERY_VALUES = new Set(['1', 'true', 'yes']);

function isLocalOnlyRuntime() {
  if (typeof window === 'undefined') return false;
  const queryLocal = new URLSearchParams(window.location.search).get('local');
  const forceLocal = queryLocal && LOCAL_MODE_QUERY_VALUES.has(String(queryLocal).toLowerCase());
  return window.location.protocol === 'file:' || !!forceLocal;
}

function cloneSeedMembers() {
  return applyMemberImageFallbacks(RESOLVED_FAMILY_MEMBERS_SEED.map((member) => ({ ...member })));
}

function parseStoredMembers(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    let members = [];
    let sourceVersion = null;

    if (Array.isArray(parsed)) {
      members = parsed;
      sourceVersion = 'legacy_array';
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.members)) {
      members = parsed.members;
      sourceVersion = parsed.sourceVersion || null;
    } else {
      return null;
    }

    const normalizedMembers = members
      .filter((item) => item && typeof item === 'object' && item.id && item.name)
      .map((item) => ({ ...item }));

    return {
      members: applyMemberImageFallbacks(normalizedMembers),
      sourceVersion,
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
    month: 'short',
    day: 'numeric',
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

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years -= 1;
  }

  return years >= 0 ? years : null;
}

function getNextAnnualDate(dateString) {
  if (!dateString) return null;
  const original = new Date(dateString);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const next = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  next.setHours(0, 0, 0, 0);

  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next.setFullYear(now.getFullYear() + 1);
  }

  return next;
}

function diffDays(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function getUpcomingEvents(members, daysAhead = 30) {
  const events = [];

  members
    .filter((member) => member.generation !== -1 && !member.date_of_death)
    .forEach((member) => {
      if (member.birth_date) {
        const date = getNextAnnualDate(member.birth_date);
        const inDays = diffDays(date);
        if (inDays !== null && inDays >= 0 && inDays <= daysAhead) {
          events.push({
            id: `${member.id}-birthday`,
            type: 'birthday',
            personName: formatDisplayName(member.name),
            date,
            inDays,
            extra: getAge(member.birth_date) !== null ? `גיל ${getAge(member.birth_date) + (inDays === 0 ? 0 : 1)}` : '',
          });
        }
      }

      if (member.wedding_date) {
        const date = getNextAnnualDate(member.wedding_date);
        const inDays = diffDays(date);
        if (inDays !== null && inDays >= 0 && inDays <= daysAhead) {
          const start = new Date(member.wedding_date);
          const years = date.getFullYear() - start.getFullYear();
          events.push({
            id: `${member.id}-wedding`,
            type: 'anniversary',
            personName: formatDisplayName(member.name),
            spouseName: formatDisplayName(member.spouse_name || ''),
            date,
            inDays,
            extra: years > 0 ? `${years} שנות נישואין` : '',
          });
        }
      }
    });

  return events.sort((a, b) => a.date - b.date);
}

function memberInitials(name) {
  const words = String(formatDisplayName(name) || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '👤';
  return words.slice(0, 2).map((word) => word[0]).join('');
}

function memberToForm(member) {
  return {
    name: member.name || '',
    gender: member.gender || 'זכר',
    generation: member.generation === null || member.generation === undefined ? '' : String(member.generation),
    father_id: member.father_id || '',
    father_name: member.father_name || '',
    mother_id: member.mother_id || '',
    mother_name: member.mother_name || '',
    spouse_id: member.spouse_id || '',
    spouse_name: member.spouse_name || '',
    birth_date: member.birth_date || '',
    date_of_death: member.date_of_death || '',
    wedding_date: member.wedding_date || '',
    phone_number: member.phone_number || '',
    email: member.email || '',
    city: member.city || '',
    neighborhood: member.neighborhood || '',
    street: member.street || '',
    house_number: member.house_number || '',
    image_url: member.image_url || '',
    notes: member.notes || '',
  };
}

function roleLabel(role) {
  if (role === 'guest') return 'אורח';
  return role === 'admin' ? 'מנהל' : 'משתמש';
}

export default function App() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState([]);

  const [activeTab, setActiveTab] = useState('overview');
  const [treeViewMode, setTreeViewMode] = useState('relations');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [editingMemberId, setEditingMemberId] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [userActionId, setUserActionId] = useState('');
  const [invitingUser, setInvitingUser] = useState(false);

  const isLocalOnlyMode = useMemo(() => isLocalOnlyRuntime(), []);
  const isAdmin = user?.role === 'admin';
  const canManageMembers = isLocalOnlyMode || isAdmin;
  const canManageUsers = !isLocalOnlyMode && isAdmin;

  const saveMembersToLocalStorage = useCallback((nextMembers) => {
    if (!isLocalOnlyMode || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOCAL_MEMBERS_STORAGE_KEY, JSON.stringify({
        sourceVersion: LOCAL_MEMBERS_SOURCE_VERSION,
        members: nextMembers,
      }));
    } catch {
      // Ignore local storage write failures and continue with in-memory state.
    }
  }, [isLocalOnlyMode]);

  const loadMembersFromLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return parseStoredMembers(window.localStorage.getItem(LOCAL_MEMBERS_STORAGE_KEY));
  }, []);

  const applySeedMembers = useCallback((persist = false) => {
    const seededMembers = cloneSeedMembers();
    setMembers(seededMembers);
    if (persist) saveMembersToLocalStorage(seededMembers);
  }, [saveMembersToLocalStorage]);

  const loadMembers = useCallback(async () => {
    if (isLocalOnlyMode) {
      const storedPayload = loadMembersFromLocalStorage();
      if (
        storedPayload &&
        storedPayload.sourceVersion === LOCAL_MEMBERS_SOURCE_VERSION &&
        storedPayload.members.length > 0
      ) {
        setMembers(storedPayload.members);
        return { usedSeed: false, localOnly: true };
      }
      applySeedMembers(true);
      return { usedSeed: true, localOnly: true };
    }

    const data = await base44.entities.FamilyMember.list('-updated_date');
    if (Array.isArray(data) && data.length > 0) {
      setMembers(applyMemberImageFallbacks(data));
      return { usedSeed: false };
    }
    applySeedMembers();
    return { usedSeed: true };
  }, [applySeedMembers, isLocalOnlyMode, loadMembersFromLocalStorage]);

  const loadUsers = useCallback(async () => {
    if (isLocalOnlyMode) {
      setUsers([]);
      return;
    }
    const data = await base44.entities.User.list('-created_date');
    setUsers(data || []);
  }, [isLocalOnlyMode]);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    setError('');

    if (isLocalOnlyMode) {
      setUser({
        id: 'local-admin',
        role: 'admin',
        display_name: 'מצב מקומי',
        email: '',
      });
      const membersLoadResult = await loadMembers();
      setUsers([]);
      if (membersLoadResult.usedSeed) {
        setError('מצב מקומי פעיל: הנתונים נטענו מקובץ משפחת_טל.xlsx ונשמרים בדפדפן בלבד.');
      } else {
        setError('מצב מקומי פעיל: נטענו נתונים מקומיים שנשמרו בדפדפן.');
      }
      setStatus('ready');
      return;
    }

    let currentUser = null;

    try {
      currentUser = await base44.auth.me();
    } catch {
      currentUser = {
        id: null,
        role: 'guest',
        display_name: 'אורח',
        email: '',
      };
    }

    setUser(currentUser);

    try {
      const membersLoadResult = await loadMembers();
      if (membersLoadResult.usedSeed) {
        setError('לא נטענו נתוני FamilyMember מהשרת. מוצגים כרגע נתונים מתוך הקובץ משפחת_טל.xlsx.');
      }
    } catch (membersError) {
      const statusCode = membersError?.status;
      if (statusCode === 401 || statusCode === 403) {
        setError('המערכת עלתה ללא התחברות לשרת הנתונים. מוצגים כרגע נתונים מתוך הקובץ משפחת_טל.xlsx.');
      } else {
        setError((membersError?.message || 'שגיאה בטעינת המידע.') + ' מוצגים כרגע נתוני גיבוי מהקובץ משפחת_טל.xlsx.');
      }
      applySeedMembers();
    }

    if (currentUser?.role === 'admin') {
      try {
        await loadUsers();
      } catch {
        setUsers([]);
      }
    } else {
      setUsers([]);
    }

    setStatus('ready');
  }, [applySeedMembers, isLocalOnlyMode, loadMembers, loadUsers]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!canManageMembers && activeTab === 'manageMembers') {
      setActiveTab('overview');
    }
    if (!canManageUsers && activeTab === 'manageUsers') {
      setActiveTab('overview');
    }
  }, [canManageMembers, canManageUsers, activeTab]);

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) {
      setSelectedMemberId(members[0].id);
      return;
    }

    if (selectedMemberId && !members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(members[0]?.id || '');
    }
  }, [members, selectedMemberId]);

  const membersById = useMemo(() => {
    return Object.fromEntries(members.map((member) => [member.id, member]));
  }, [members]);

  const selectedMember = useMemo(() => {
    return members.find((member) => member.id === selectedMemberId) || null;
  }, [members, selectedMemberId]);
  const selectedMemberImageUrl = resolveMemberImageUrl(selectedMember?.image_url);

  const treeMembers = useMemo(() => members.filter((member) => member.generation !== -1), [members]);

  const stats = useMemo(() => {
    const living = treeMembers.filter((member) => !member.date_of_death).length;
    const withImages = treeMembers.filter((member) => !!member.image_url).length;
    const withAddress = treeMembers.filter((member) => !!member.city || !!member.street || !!member.neighborhood).length;

    return {
      total: treeMembers.length,
      living,
      withImages,
      withAddress,
    };
  }, [treeMembers]);

  const filteredMembers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return treeMembers;

    return treeMembers.filter((member) => {
      return [member.name, member.city, member.spouse_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [treeMembers, searchTerm]);

  const groupedMembers = useMemo(() => {
    const map = new Map();
    filteredMembers.forEach((member) => {
      const generation = member.generation ?? 99;
      if (!map.has(generation)) map.set(generation, []);
      map.get(generation).push(member);
    });

    Array.from(map.values()).forEach((list) => {
      list.sort((a, b) => String(formatDisplayName(a.name)).localeCompare(String(formatDisplayName(b.name)), 'he'));
    });

    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [filteredMembers]);

  const upcomingEvents = useMemo(() => getUpcomingEvents(treeMembers), [treeMembers]);

  const startCreateMember = () => {
    setEditingMemberId('');
    setMemberForm(EMPTY_MEMBER_FORM);
  };

  const startEditMember = (member) => {
    setEditingMemberId(member.id);
    setMemberForm(memberToForm(member));
    setActiveTab('manageMembers');
  };

  const onMemberFormChange = (field, value) => {
    setMemberForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildMemberPayload = () => {
    const spouseById = memberForm.spouse_id ? membersById[memberForm.spouse_id] : null;

    return {
      name: memberForm.name.trim(),
      gender: memberForm.gender || 'לא ידוע',
      generation: memberForm.generation === '' ? null : Number(memberForm.generation),
      father_id: memberForm.father_id || null,
      father_name: memberForm.father_id ? '' : (memberForm.father_name || '').trim(),
      mother_id: memberForm.mother_id || null,
      mother_name: memberForm.mother_id ? '' : (memberForm.mother_name || '').trim(),
      spouse_id: memberForm.spouse_id || null,
      spouse_name: spouseById ? spouseById.name : (memberForm.spouse_name || '').trim(),
      birth_date: memberForm.birth_date || null,
      date_of_death: memberForm.date_of_death || null,
      wedding_date: memberForm.wedding_date || null,
      phone_number: (memberForm.phone_number || '').trim(),
      email: (memberForm.email || '').trim(),
      city: (memberForm.city || '').trim(),
      neighborhood: (memberForm.neighborhood || '').trim(),
      street: (memberForm.street || '').trim(),
      house_number: (memberForm.house_number || '').trim(),
      image_url: (memberForm.image_url || '').trim() || null,
      notes: (memberForm.notes || '').trim(),
    };
  };

  const handleSaveMember = async (event) => {
    event.preventDefault();
    if (!memberForm.name.trim()) {
      alert('שם מלא הוא שדה חובה.');
      return;
    }

    setSavingMember(true);
    try {
      const payload = buildMemberPayload();
      if (isLocalOnlyMode) {
        let nextMembers = members;
        if (editingMemberId) {
          nextMembers = members.map((member) => (member.id === editingMemberId ? { ...member, ...payload } : member));
        } else {
          const newMemberId = `local_${Date.now()}`;
          nextMembers = [{ id: newMemberId, ...payload }, ...members];
          setSelectedMemberId(newMemberId);
        }
        setMembers(nextMembers);
        saveMembersToLocalStorage(nextMembers);
      } else {
        if (editingMemberId) {
          await base44.entities.FamilyMember.update(editingMemberId, payload);
        } else {
          await base44.entities.FamilyMember.create(payload);
        }
        await loadMembers();
      }

      if (!editingMemberId) {
        startCreateMember();
      }
      alert('השמירה בוצעה בהצלחה.');
    } catch (err) {
      alert(`שגיאה בשמירת בן המשפחה: ${err?.message || 'לא ידוע'}`);
    } finally {
      setSavingMember(false);
    }
  };

  const handleDeleteMember = async (member) => {
    if (!window.confirm(`למחוק את ${formatDisplayName(member.name)}?`)) return;

    try {
      if (isLocalOnlyMode) {
        const nextMembers = members.filter((existingMember) => existingMember.id !== member.id);
        setMembers(nextMembers);
        saveMembersToLocalStorage(nextMembers);
      } else {
        await base44.entities.FamilyMember.delete(member.id);
        await loadMembers();
      }
      if (editingMemberId === member.id) {
        startCreateMember();
      }
      alert('הרשומה נמחקה.');
    } catch (err) {
      alert(`שגיאה במחיקה: ${err?.message || 'לא ידוע'}`);
    }
  };

  const normalizeGenders = async () => {
    if (!window.confirm('להמיר male/female לערכי עברית?')) return;

    setBulkBusy(true);
    let updated = 0;

    try {
      if (isLocalOnlyMode) {
        const nextMembers = members.map((member) => {
          const current = (member.gender || '').toLowerCase();
          let next = null;
          if (current === 'male') next = 'זכר';
          if (current === 'female') next = 'נקבה';
          if (next) {
            updated += 1;
            return { ...member, gender: next };
          }
          return member;
        });
        setMembers(nextMembers);
        saveMembersToLocalStorage(nextMembers);
      } else {
        for (const member of members) {
          const current = (member.gender || '').toLowerCase();
          let next = null;
          if (current === 'male') next = 'זכר';
          if (current === 'female') next = 'נקבה';

          if (next) {
            await base44.entities.FamilyMember.update(member.id, { gender: next });
            updated += 1;
          }
        }
        await loadMembers();
      }
      alert(`המרה הושלמה. עודכנו ${updated} רשומות.`);
    } catch (err) {
      alert(`שגיאה בהמרה: ${err?.message || 'לא ידוע'}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleInviteUser = async () => {
    if (isLocalOnlyMode) {
      alert('במצב מקומי אין שליחת הזמנות משתמשים דרך שרת.');
      return;
    }

    const email = inviteEmail.trim();
    if (!email) {
      alert('נא להזין כתובת אימייל.');
      return;
    }

    setInvitingUser(true);
    try {
      await base44.users.inviteUser(email, 'user');
      setInviteEmail('');
      alert(`הזמנה נשלחה ל-${email}`);
      if (isAdmin) {
        await loadUsers();
      }
    } catch (err) {
      alert(`שגיאה בשליחת הזמנה: ${err?.message || 'לא ידוע'}`);
    } finally {
      setInvitingUser(false);
    }
  };

  const handleUserRoleChange = async (targetUser, role) => {
    if (isLocalOnlyMode) {
      alert('במצב מקומי אין ניהול משתמשים דרך שרת.');
      return;
    }

    if (!window.confirm(`לעדכן תפקיד עבור ${targetUser.display_name || targetUser.email} ל-${roleLabel(role)}?`)) {
      return;
    }

    const adminCount = users.filter((u) => u.role === 'admin').length;
    if (targetUser.id === user?.id && role !== 'admin' && adminCount === 1) {
      alert('לא ניתן להסיר הרשאת מנהל מהחשבון היחיד שנותר.');
      return;
    }

    setUserActionId(targetUser.id);
    try {
      await base44.entities.User.update(targetUser.id, { role });
      await loadUsers();
    } catch (err) {
      alert(`שגיאה בעדכון משתמש: ${err?.message || 'לא ידוע'}`);
    } finally {
      setUserActionId('');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (isLocalOnlyMode) {
      alert('במצב מקומי אין ניהול משתמשים דרך שרת.');
      return;
    }

    if (targetUser.id === user?.id) {
      alert('לא ניתן למחוק את המשתמש המחובר כרגע.');
      return;
    }

    const adminCount = users.filter((u) => u.role === 'admin').length;
    if (targetUser.role === 'admin' && adminCount === 1) {
      alert('לא ניתן למחוק את המנהל האחרון במערכת.');
      return;
    }

    if (!window.confirm(`למחוק את המשתמש ${targetUser.display_name || targetUser.email}?`)) {
      return;
    }

    setUserActionId(targetUser.id);
    try {
      await base44.entities.User.delete(targetUser.id);
      await loadUsers();
    } catch (err) {
      alert(`שגיאה במחיקת משתמש: ${err?.message || 'לא ידוע'}`);
    } finally {
      setUserActionId('');
    }
  };

  const handleLogout = () => {
    if (isLocalOnlyMode) {
      window.location.reload();
      return;
    }
    base44.auth.logout(window.location.href);
  };

  if (status === 'loading') {
    return (
      <div className="state-screen" dir="rtl">
        <div className="state-card">טוען את ממשק הניהול החדש...</div>
      </div>
    );
  }

  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <div>
          <p className="eyebrow">codeTAL2</p>
          <h1>ממשק ניהול ותצוגה חדש</h1>
          <p className="subtitle">
            {isLocalOnlyMode
              ? 'מצב מקומי מלא: ללא שרת, הנתונים נשמרים בדפדפן'
              : 'מבוסס על נתוני FamilyMember ו-User הקיימים'}
          </p>
        </div>

        <div className="topbar-actions">
          <div className="user-badge">
            <strong>{user?.display_name || user?.full_name || user?.email || 'אורח'}</strong>
            <span>{roleLabel(user?.role || 'guest')}</span>
          </div>
          <button className="ghost-btn" onClick={bootstrap}>רענון</button>
          {!!user?.id && !isLocalOnlyMode && <button className="ghost-btn" onClick={handleLogout}>התנתקות</button>}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabbar">
        <button
          className={activeTab === 'overview' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('overview')}
        >
          תצוגת משפחה
        </button>
        {canManageMembers && (
          <>
            <button
              className={activeTab === 'manageMembers' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('manageMembers')}
            >
              ניהול בני משפחה
            </button>
            {canManageUsers && (
              <button
                className={activeTab === 'manageUsers' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('manageUsers')}
              >
                ניהול משתמשים
              </button>
            )}
          </>
        )}
      </nav>

      {activeTab === 'overview' && (
        <section className="layout-2col">
          <article className="panel">
            <div className="panel-header">
              <h2>רשימת בני משפחה</h2>
              <input
                type="search"
                className="search-input"
                placeholder="חיפוש לפי שם, עיר או בן/בת זוג"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="member-list">
              {groupedMembers.length === 0 && <p className="muted">לא נמצאו תוצאות.</p>}

              {groupedMembers.map(([generation, group]) => (
                <div key={String(generation)} className="member-group">
                  <h3>דור {generation}</h3>
                  {group.map((member) => (
                    <button
                      key={member.id}
                      className={selectedMemberId === member.id ? 'member-row active' : 'member-row'}
                      onClick={() => setSelectedMemberId(member.id)}
                    >
                      <span className="member-main">
                        {member.date_of_death ? `${formatDisplayName(member.name)} ז"ל` : formatDisplayName(member.name)}
                      </span>
                      <span className="member-sub">{member.city || formatDisplayName(member.spouse_name) || member.gender || '-'}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="stats-grid">
              <div className="stat-card">
                <span>סה"כ בעץ</span>
                <strong>{stats.total}</strong>
              </div>
              <div className="stat-card">
                <span>חיים</span>
                <strong>{stats.living}</strong>
              </div>
              <div className="stat-card">
                <span>עם תמונה</span>
                <strong>{stats.withImages}</strong>
              </div>
              <div className="stat-card">
                <span>עם כתובת</span>
                <strong>{stats.withAddress}</strong>
              </div>
            </div>

            {selectedMember ? (
              <div className="details-card">
                <div className="details-header">
                  <div className="details-header-main">
                    <div className="details-header-title">
                      <h2>
                        {selectedMember.date_of_death
                          ? `${formatDisplayName(selectedMember.name)} ז"ל`
                          : formatDisplayName(selectedMember.name)}
                      </h2>
                      <p>{selectedMember.gender || 'ללא מין מוגדר'} • דור {selectedMember.generation ?? '-'}</p>
                    </div>
                    <span className="details-photo-frame">
                      {selectedMemberImageUrl ? (
                        <img
                          className="details-photo"
                          src={selectedMemberImageUrl}
                          alt={formatDisplayName(selectedMember.name)}
                          loading="lazy"
                        />
                      ) : (
                        <span className="details-photo-placeholder">{memberInitials(selectedMember.name)}</span>
                      )}
                    </span>
                  </div>
                  {canManageMembers && (
                    <button className="ghost-btn" onClick={() => startEditMember(selectedMember)}>
                      עריכה
                    </button>
                  )}
                </div>

                <dl className="details-grid">
                  <div>
                    <dt>תאריך לידה</dt>
                    <dd>{toShortDate(selectedMember.birth_date)}</dd>
                  </div>
                  <div>
                    <dt>תאריך נישואין</dt>
                    <dd>{toShortDate(selectedMember.wedding_date)}</dd>
                  </div>
                  <div>
                    <dt>תאריך פטירה</dt>
                    <dd>{toShortDate(selectedMember.date_of_death)}</dd>
                  </div>
                  <div>
                    <dt>טלפון</dt>
                    <dd>{selectedMember.phone_number || '-'}</dd>
                  </div>
                  <div>
                    <dt>אימייל</dt>
                    <dd>{selectedMember.email || '-'}</dd>
                  </div>
                  <div>
                    <dt>עיר / ישוב</dt>
                    <dd>{selectedMember.city || '-'}</dd>
                  </div>
                  <div>
                    <dt>רחוב</dt>
                    <dd>{selectedMember.street || '-'}</dd>
                  </div>
                  <div>
                    <dt>בן/בת זוג</dt>
                    <dd>
                      {selectedMember.spouse_id
                        ? formatDisplayName(membersById[selectedMember.spouse_id]?.name || selectedMember.spouse_name) || '-'
                        : formatDisplayName(selectedMember.spouse_name) || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>אב</dt>
                    <dd>
                      {selectedMember.father_id
                        ? formatDisplayName(membersById[selectedMember.father_id]?.name || selectedMember.father_name) || '-'
                        : formatDisplayName(selectedMember.father_name) || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>אם</dt>
                    <dd>
                      {selectedMember.mother_id
                        ? formatDisplayName(membersById[selectedMember.mother_id]?.name || selectedMember.mother_name) || '-'
                        : formatDisplayName(selectedMember.mother_name) || '-'}
                    </dd>
                  </div>
                </dl>

                {selectedMember.notes && (
                  <div className="notes-box">
                    <h4>הערות</h4>
                    <p>{selectedMember.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">בחר בן משפחה להצגת פרטים.</p>
            )}

            <div className="events-card">
              <h3>אירועים קרובים (30 יום)</h3>
              {upcomingEvents.length === 0 ? (
                <p className="muted">אין אירועים קרובים.</p>
              ) : (
                <ul>
                  {upcomingEvents.map((eventItem) => (
                    <li key={eventItem.id}>
                      <div>
                        <strong>{eventItem.type === 'birthday' ? 'יום הולדת' : 'יום נישואין'}</strong>
                        <span>
                          {eventItem.type === 'birthday'
                            ? `ל${eventItem.personName}`
                            : `ל${eventItem.personName}${eventItem.spouseName ? ` ו${eventItem.spouseName}` : ''}`}
                        </span>
                      </div>
                      <div>
                        <span>{toShortDate(eventItem.date)}</span>
                        <span>{eventItem.inDays === 0 ? 'היום' : `בעוד ${eventItem.inDays} ימים`}</span>
                        {eventItem.extra && <span>{eventItem.extra}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tree-panel">
              <h3>תרשים עץ משפחה לפי קשרים</h3>
              <div className="tree-view-switch">
                <button
                  type="button"
                  className={treeViewMode === 'relations' ? 'tree-view-btn active' : 'tree-view-btn'}
                  onClick={() => setTreeViewMode('relations')}
                >
                  תרשים קשרים
                </button>
                <button
                  type="button"
                  className={treeViewMode === 'schematic' ? 'tree-view-btn active' : 'tree-view-btn'}
                  onClick={() => setTreeViewMode('schematic')}
                >
                  מרשם סכימתי
                </button>
              </div>

              {treeViewMode === 'relations' ? (
                <FamilyTreeDiagram
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
            </div>
          </article>
        </section>
      )}

      {activeTab === 'manageMembers' && canManageMembers && (
        <section className="layout-2col">
          <article className="panel">
            <div className="panel-header space-between">
              <h2>{editingMemberId ? 'עריכת בן משפחה' : 'הוספת בן משפחה'}</h2>
              <button className="ghost-btn" onClick={startCreateMember}>חדש</button>
            </div>

            <form onSubmit={handleSaveMember} className="member-form">
              <div className="form-grid">
                <label>
                  שם מלא *
                  <input value={memberForm.name} onChange={(e) => onMemberFormChange('name', e.target.value)} required />
                </label>

                <label>
                  מין
                  <select value={memberForm.gender} onChange={(e) => onMemberFormChange('gender', e.target.value)}>
                    {GENDER_OPTIONS.map((gender) => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </label>

                <label>
                  דור
                  <input
                    type="number"
                    value={memberForm.generation}
                    onChange={(e) => onMemberFormChange('generation', e.target.value)}
                    placeholder="למשל 2"
                  />
                </label>

                <label>
                  בן/בת זוג (רשומה קיימת)
                  <select value={memberForm.spouse_id} onChange={(e) => onMemberFormChange('spouse_id', e.target.value)}>
                    <option value="">ללא</option>
                    {members
                      .filter((member) => member.id !== editingMemberId)
                      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                      .map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                  </select>
                </label>

                <label>
                  שם בן/בת זוג (טקסט)
                  <input
                    value={memberForm.spouse_name}
                    onChange={(e) => onMemberFormChange('spouse_name', e.target.value)}
                    placeholder="יתמלא אוטומטית אם נבחר מזהה"
                    disabled={!!memberForm.spouse_id}
                  />
                </label>

                <label>
                  תאריך לידה
                  <input type="date" value={memberForm.birth_date} onChange={(e) => onMemberFormChange('birth_date', e.target.value)} />
                </label>

                <label>
                  תאריך נישואין
                  <input type="date" value={memberForm.wedding_date} onChange={(e) => onMemberFormChange('wedding_date', e.target.value)} />
                </label>

                <label>
                  תאריך פטירה
                  <input type="date" value={memberForm.date_of_death} onChange={(e) => onMemberFormChange('date_of_death', e.target.value)} />
                </label>

                <label>
                  אב (רשומה קיימת)
                  <select value={memberForm.father_id} onChange={(e) => onMemberFormChange('father_id', e.target.value)}>
                    <option value="">ללא</option>
                    {members
                      .filter((member) => member.id !== editingMemberId)
                      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                      .map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                  </select>
                </label>

                <label>
                  שם אב (טקסט)
                  <input
                    value={memberForm.father_name}
                    onChange={(e) => onMemberFormChange('father_name', e.target.value)}
                    disabled={!!memberForm.father_id}
                  />
                </label>

                <label>
                  אם (רשומה קיימת)
                  <select value={memberForm.mother_id} onChange={(e) => onMemberFormChange('mother_id', e.target.value)}>
                    <option value="">ללא</option>
                    {members
                      .filter((member) => member.id !== editingMemberId)
                      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                      .map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                  </select>
                </label>

                <label>
                  שם אם (טקסט)
                  <input
                    value={memberForm.mother_name}
                    onChange={(e) => onMemberFormChange('mother_name', e.target.value)}
                    disabled={!!memberForm.mother_id}
                  />
                </label>

                <label>
                  טלפון
                  <input value={memberForm.phone_number} onChange={(e) => onMemberFormChange('phone_number', e.target.value)} />
                </label>

                <label>
                  אימייל
                  <input type="email" value={memberForm.email} onChange={(e) => onMemberFormChange('email', e.target.value)} />
                </label>

                <label>
                  עיר / ישוב
                  <input value={memberForm.city} onChange={(e) => onMemberFormChange('city', e.target.value)} />
                </label>

                <label>
                  שכונה
                  <input value={memberForm.neighborhood} onChange={(e) => onMemberFormChange('neighborhood', e.target.value)} />
                </label>

                <label>
                  רחוב
                  <input value={memberForm.street} onChange={(e) => onMemberFormChange('street', e.target.value)} />
                </label>

                <label>
                  מספר בית
                  <input value={memberForm.house_number} onChange={(e) => onMemberFormChange('house_number', e.target.value)} />
                </label>

                <label className="full-row">
                  קישור לתמונה (URL)
                  <input value={memberForm.image_url} onChange={(e) => onMemberFormChange('image_url', e.target.value)} />
                </label>

                <label className="full-row">
                  הערות
                  <textarea value={memberForm.notes} onChange={(e) => onMemberFormChange('notes', e.target.value)} rows={4} />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-btn" disabled={savingMember}>
                  {savingMember ? 'שומר...' : editingMemberId ? 'עדכון רשומה' : 'יצירת רשומה'}
                </button>
                <button type="button" className="ghost-btn" onClick={startCreateMember}>
                  ניקוי טופס
                </button>
                <button type="button" className="ghost-btn" disabled={bulkBusy} onClick={normalizeGenders}>
                  {bulkBusy ? 'ממיר...' : 'המרת male/female לעברית'}
                </button>
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>רשומות בני משפחה ({members.length})</h2>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>דור</th>
                    <th>מין</th>
                    <th>עיר</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {members
                    .slice()
                    .sort((a, b) => {
                      const ga = a.generation ?? 99;
                      const gb = b.generation ?? 99;
                      if (ga !== gb) return ga - gb;
                      return a.name.localeCompare(b.name, 'he');
                    })
                    .map((member) => (
                      <tr key={member.id}>
                        <td>{formatDisplayName(member.name)}</td>
                        <td>{member.generation ?? '-'}</td>
                        <td>{member.gender || '-'}</td>
                        <td>{member.city || '-'}</td>
                        <td>
                          <div className="row-actions">
                            <button className="ghost-btn tiny" onClick={() => startEditMember(member)}>ערוך</button>
                            <button className="ghost-btn tiny danger" onClick={() => handleDeleteMember(member)}>מחק</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === 'manageUsers' && canManageUsers && (
        <section className="layout-1col">
          <article className="panel">
            <div className="panel-header">
              <h2>הזמנת משתמש חדש</h2>
            </div>

            <div className="inline-form">
              <input
                type="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInviteUser();
                  }
                }}
              />
              <button className="primary-btn" onClick={handleInviteUser} disabled={invitingUser}>
                {invitingUser ? 'שולח...' : 'שלח הזמנה'}
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>משתמשי המערכת ({users.length})</h2>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>אימייל</th>
                    <th>תפקיד</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((account) => (
                    <tr key={account.id}>
                      <td>{account.display_name || account.full_name || '-'}</td>
                      <td>{account.email}</td>
                      <td>{roleLabel(account.role)}</td>
                      <td>
                        <div className="row-actions">
                          {account.role === 'admin' ? (
                            <button
                              className="ghost-btn tiny"
                              disabled={userActionId === account.id}
                              onClick={() => handleUserRoleChange(account, 'user')}
                            >
                              הפוך למשתמש
                            </button>
                          ) : (
                            <button
                              className="ghost-btn tiny"
                              disabled={userActionId === account.id}
                              onClick={() => handleUserRoleChange(account, 'admin')}
                            >
                              הפוך למנהל
                            </button>
                          )}

                          <button
                            className="ghost-btn tiny danger"
                            disabled={userActionId === account.id}
                            onClick={() => handleDeleteUser(account)}
                          >
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
