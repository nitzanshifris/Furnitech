// Translation strings for AR Furniture Platform
// Easy to modify for different languages and markets

const STRINGS = {
    // English (LTR)
    en: {
        direction: 'ltr',
        
        // AR Viewer Page (view.html)
        scanWithPhone: 'Scan me with your phone',
        seeInSpace: 'to see',
        inYourSpace: 'in your space! 😊',
        
        // Instructions
        openCamera: 'Open your camera app',
        pointAtQR: 'Point at the QR code', 
        seeMagic: 'See the magic happen!',
        
        // Success messages
        uploadSuccess: 'Furniture uploaded successfully!',
        settingsSaved: 'Brand settings saved successfully!'
    },
    
    // Hebrew (RTL) 
    he: {
        direction: 'rtl',
        
        // AR Viewer Page (view.html)  
        scanWithPhone: 'סרוק אותי עם הטלפון שלך',
        seeInSpace: 'כדי לראות את',
        inYourSpace: 'בחלל שלך! 😊',
        
        // Instructions
        openCamera: 'פתח את אפליקציית המצלמה שלך',
        pointAtQR: 'כוון לקוד ה-QR',
        seeMagic: 'תיהנה מהקסם!',
        
        // Success messages
        uploadSuccess: 'הרהיט הועלה בהצלחה!',
        settingsSaved: 'הגדרות המותג נשמרו בהצלחה!'
    }
};

// Helper function to get strings for current language
function getStrings(language = 'en') {
    return STRINGS[language] || STRINGS.en;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STRINGS, getStrings };
}