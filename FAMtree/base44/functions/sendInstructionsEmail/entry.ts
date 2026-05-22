import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const userIds = body.userIds || null;

        const allUsers = await base44.asServiceRole.entities.User.list();
        const usersToSend = userIds
            ? allUsers.filter(u => userIds.includes(u.id))
            : allUsers;

        const appId = Deno.env.get('BASE44_APP_ID') || '';
        const appUrl = `https://${appId}.base44.app`;

        const subject = '🌳 הוראות התחברות המעודכנות לאפליקציית עץ המשפחה';

        const body_text = `שלום,

אנו שמחים שאתם חלק מאפליקציית עץ המשפחה של משפחת טל 🌳

📱 קישור לאפליקציה:
${appUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 כיצד להיכנס לאפליקציה?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

פתחו את הקישור בדפדפן:
${appUrl}

⚠️ חשוב מאוד — טלפון נייד:
אם הדף נפתח ריק או לא נטען — זהו פתרון פשוט:
• ב-iPhone: השתמשו ב-Chrome (לא Safari) להיכנס לאפליקציה
  (הורידו Chrome מה-App Store אם אין לכם)
• ב-Android: Chrome עובד מצוין

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ אפשרות 1 — כניסה עם גוגל (הכי קל!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• פתחו את הקישור ב-Chrome
• לחצו על הכפתור "Continue with Google"
• בחרו את חשבון ה-Gmail שלכם
• זהו! אין צורך בסיסמה

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ אפשרות 2 — כניסה עם אימייל וסיסמה
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

אם אינכם משתמשים ב-Gmail, הגדירו סיסמה חדשה כך:

• לחצו על "Forgot password?" (שכחתי סיסמה)
• הזינו את כתובת המייל שלכם
• תקבלו מייל עם קישור לאיפוס סיסמה
• הגדירו סיסמה חדשה והיכנסו

(גם כאן — כדאי לפתוח ב-Chrome על נייד)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📲 לאחר הכניסה — הוספת אייקון למסך הבית:
• ב-iPhone/iPad (ב-Chrome): לחצו על ⋮ ← "הוסף למסך הבית"
• ב-Android: לחצו על תפריט הדפדפן (3 נקודות) ← "הוסף למסך הבית"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ אם אינכם מקבלים את מייל הסיסמה:
• בדקו תיקיית "ספאם" או "דואר זבל"
• בדקו את הלשונית "קידומי מכירות" (Promotions) ב-Gmail
• ודאו שהזנתם את הכתובת הנכונה

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

לכל שאלה או תקלה, פנו ליחיאל.

בברכה,
מערכת אילן יוחסין משפחת טל 🌳
${appUrl}`;

        let successCount = 0;
        let failCount = 0;

        for (const u of usersToSend) {
            try {
                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: u.email,
                    subject,
                    body: body_text,
                    from_name: 'עץ המשפחה - משפחת טל'
                });
                console.log(`✅ נשלח ל: ${u.email}`);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`❌ נכשל: ${u.email}`, error);
                failCount++;
            }
        }

        return Response.json({
            success: true,
            message: `נשלחו ${successCount} מיילים בהצלחה`,
            sent: successCount,
            failed: failCount
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});