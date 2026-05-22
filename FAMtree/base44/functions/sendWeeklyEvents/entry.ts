import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // קריאת פרמטרים
        const body = await req.json().catch(() => ({}));
        const userIds = body.userIds || null;

        // טעינת כל בני המשפחה והמשתמשים
        const [members, allUsers] = await Promise.all([
            base44.asServiceRole.entities.FamilyMember.list(),
            base44.asServiceRole.entities.User.list()
        ]);
        
        // סינון לפי משתמשים נבחרים אם צוינו
        const usersToSend = userIds 
            ? allUsers.filter(u => userIds.includes(u.id))
            : allUsers;

        if (usersToSend.length === 0) {
            return Response.json({ 
                success: false, 
                message: 'לא נמצאו משתמשים לשליחה' 
            });
        }
        
        // חישוב תחילת וסוף השבוע הנוכחי
        const today = new Date();
        const currentDayOfWeek = today.getDay(); // 0 = ראשון
        
        // תחילת השבוע (יום ראשון)
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - currentDayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        
        // סוף השבוע (שבת)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        const currentYear = weekStart.getFullYear();
        const events = [];
        
        // סינון אנשים חיים בלבד
        const livingMembers = members.filter(p => !p.date_of_death && p.generation !== -1);
        
        livingMembers.forEach(person => {
            // ימי הולדת
            if (person.birth_date) {
                try {
                    const birthDate = new Date(person.birth_date);
                    let nextBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
                    
                    if (nextBirthday < weekStart) {
                        nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
                    }
                    
                    if (nextBirthday >= weekStart && nextBirthday <= weekEnd) {
                        const age = nextBirthday.getFullYear() - birthDate.getFullYear();
                        events.push({
                            type: 'birthday',
                            personName: person.name,
                            date: nextBirthday,
                            age: age,
                        });
                    }
                } catch (e) {
                    console.error(`שגיאה בתאריך לידה עבור ${person.name}`);
                }
            }
            
            // ימי נישואין
            if (person.wedding_date) {
                try {
                    const weddingDate = new Date(person.wedding_date);
                    let nextAnniversary = new Date(currentYear, weddingDate.getMonth(), weddingDate.getDate());
                    
                    if (nextAnniversary < weekStart) {
                        nextAnniversary = new Date(currentYear + 1, weddingDate.getMonth(), weddingDate.getDate());
                    }
                    
                    if (nextAnniversary >= weekStart && nextAnniversary <= weekEnd) {
                        const years = nextAnniversary.getFullYear() - weddingDate.getFullYear();
                        events.push({
                            type: 'anniversary',
                            personName: person.name,
                            spouseName: person.spouse_name,
                            date: nextAnniversary,
                            years: years,
                        });
                    }
                } catch (e) {
                    console.error(`שגיאה בתאריך נישואין עבור ${person.name}`);
                }
            }
        });
        
        // מיון לפי תאריך
        events.sort((a, b) => a.date - b.date);
        
        // אם אין אירועים, לא שולחים מיילים
        if (events.length === 0) {
            return Response.json({ 
                success: true, 
                message: 'אין אירועים השבוע - לא נשלחו מיילים',
                eventsCount: 0
            });
        }
        
        // בניית תוכן המייל
        const formatDate = (date) => {
            const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
            const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
            return `${days[date.getDay()]}, ${date.getDate()} ב${months[date.getMonth()]}`;
        };
        
        const formatWeekDate = (date) => {
            const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
            return `${date.getDate()} ב${months[date.getMonth()]}`;
        };
        
        let emailContent = `שלום,\n\n`;
        emailContent += `🌳 אילן יוחסין משפחת טל - אירועים השבוע:\n\n`;
        emailContent += `📅 שבוע: ${formatWeekDate(weekStart)} - ${formatWeekDate(weekEnd)}, ${weekEnd.getFullYear()}\n\n`;
        
        events.forEach((event) => {
            const eventIcon = event.type === 'birthday' ? '🎂' : '💍';
            const eventType = event.type === 'birthday' ? 'יום הולדת' : 'יום נישואין';
            const eventDate = formatDate(event.date);
            
            emailContent += `${eventIcon} ${eventType}:\n`;
            
            if (event.type === 'birthday') {
                emailContent += `   • ${event.personName} חוגג/ת גיל ${event.age}\n`;
            } else {
                emailContent += `   • ${event.personName} ו${event.spouseName} חוגגים ${event.years} שנות נישואין\n`;
            }
            
            emailContent += `   • ${eventDate}\n\n`;
        });
        
        const appId = Deno.env.get('BASE44_APP_ID') || '';
        const appUrl = `https://${appId}.base44.app`;
        emailContent += `\n🔗 לצפייה בפרטים נוספים על בעלי האירועים:\n${appUrl}\n\n`;
        emailContent += `בברכה,\nמערכת אילן יוחסין משפחת טל 🌳`;
        
        // שליחת מייל למשתמשים הנבחרים
        let successCount = 0;
        let failCount = 0;
        
        for (const user of usersToSend) {
            try {
                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: user.email,
                    subject: `🌳 אירועים השבוע - משפחת טל (${events.length} אירועים)`,
                    body: emailContent,
                    from_name: 'עץ המשפחה'
                });
                console.log(`✅ נשלח מייל ל: ${user.email}`);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`Failed to send email to ${user.email}:`, error);
                failCount++;
            }
        }
        
        return Response.json({ 
            success: true,
            message: `נשלחו ${successCount} מיילים בהצלחה`,
            eventsCount: events.length,
            emailsSent: successCount,
            emailsFailed: failCount
        });
        
    } catch (error) {
        console.error('Error in sendWeeklyEvents:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});