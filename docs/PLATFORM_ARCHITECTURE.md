# 🏗️ Platform Architecture - What Lives Where

## 📊 **Supabase (Database)**
**Purpose:** Central brain - stores all DATA about your furniture

### What's Stored:
- **furniture_models** table:
  - `id`: Unique identifier for each furniture
  - `model_name`: "Modern Sofa", "Wooden Chair", etc.
  - `model_url`: Link to the 3D file (currently Cloudinary URLs)
  - `category`: "Living Room", "Bedroom", "Office"
  - `subcategory`: "Sofas", "Chairs", "Tables"
  - `sku`: Product code
  - `view_count`: How many times viewed
  - `created_at`: When added
  - `price`: Cost of the item
  - `description`: Product details
  - `thumbnail_url`: Preview image

- **categories** table:
  - List of all main categories
  - Hebrew/English names
  - Display order

- **subcategories** table:
  - List of all subcategories
  - Which category they belong to
  - Hebrew/English names

- **users** table:
  - Admin users who manage the system
  - Login credentials
  - Permissions

### Think of it as:
**The inventory list** - like an Excel spreadsheet that says "We have these 500 furniture items, and here's everything about them"

---

## ☁️ **Cloudinary (Media Storage)** - CURRENTLY
**Purpose:** Stores the actual 3D model FILES

### What's Stored:
- `.glb` files (3D models) - The actual 3D furniture files
- `.jpg`/`.png` thumbnails - Preview images
- Processed versions of models
- ~500+ furniture model files
- Each file is 5-50MB

### Think of it as:
**The warehouse** - where the actual 3D furniture files are physically stored

---

## 🚀 **AWS S3 (Media Storage)** - FUTURE
**Purpose:** Will replace Cloudinary for storing 3D files

### What Will Be Stored:
- Same `.glb` files moved from Cloudinary
- Same thumbnails
- But 6x cheaper!
- Better performance with CloudFront CDN

### Think of it as:
**The new, cheaper warehouse** - same furniture files, different storage location

---

## ⚡ **Vercel (Web Hosting & Code)**
**Purpose:** Runs your website and API

### What's Stored:
- **Frontend Files:**
  - `login.html` - Login page
  - `admin.html` - Admin dashboard
  - `customer.html` - Customer management
  - `view.html` - AR viewer page
  - CSS styles
  - JavaScript code

- **API Endpoints:**
  - `/api/index.js` - Main API
  - `/api/sheets/*.js` - Google Sheets sync
  - `/api/aws-model-proxy.js` - New AWS proxy
  - All the code that makes the website work

- **Configuration:**
  - `vercel.json` - Routing rules
  - Environment variables (passwords, API keys)

### Think of it as:
**The store front and cash register** - the actual website people visit and the code that runs everything

---

## 🔄 **How They Work Together**

```
CURRENT FLOW:
1. User visits: newfurniture.live/chair-xyz (VERCEL)
2. Vercel asks Supabase: "What's the info for chair-xyz?" (SUPABASE)
3. Supabase returns: "It's called 'Modern Chair', file is at cloudinary.com/chair.glb"
4. Vercel loads the 3D file from Cloudinary (CLOUDINARY)
5. User sees the chair in AR

AFTER MIGRATION:
1. User visits: newfurniture.live/chair-xyz (VERCEL)
2. Vercel asks Supabase: "What's the info for chair-xyz?" (SUPABASE)
3. Supabase returns: "It's called 'Modern Chair', file is at aws.com/chair.glb"
4. Vercel loads the 3D file from AWS S3 (AWS)
5. User sees the chair in AR
```

---

## 💰 **Cost Breakdown**

### Current Monthly Costs:
- **Supabase:** ~$25/month (database)
- **Cloudinary:** ~$300-650/month (file storage) ❌ Expensive!
- **Vercel:** ~$20/month (web hosting)
- **Total:** ~$345-695/month

### After Migration:
- **Supabase:** ~$25/month (database) - NO CHANGE
- **AWS S3:** ~$45-65/month (file storage) ✅ Much cheaper!
- **Vercel:** ~$20/month (web hosting) - NO CHANGE
- **Total:** ~$90-110/month

### Savings: ~$255-585/month (73-84% reduction!)

---

## 🎯 **What We're Actually Doing**

**We're NOT changing:**
- ❌ Supabase (still your database)
- ❌ Vercel (still your website)
- ❌ The website code
- ❌ How customers use the site

**We ARE changing:**
- ✅ Moving 3D files from Cloudinary → AWS S3
- ✅ Updating Supabase records to point to new AWS URLs
- ✅ Adding a proxy to serve files from AWS

---

## 🔑 **Why Each Platform**

**Supabase:**
- Great for structured data
- Easy queries
- Real-time updates
- Good pricing for databases

**Vercel:**
- Fast website hosting
- Automatic deployments from GitHub
- Serverless functions
- Great developer experience

**Cloudinary (current problem):**
- Was easy to set up
- BUT very expensive for large files
- Charges for bandwidth AND storage
- Overkill for just serving GLB files

**AWS S3 (solution):**
- Much cheaper for file storage
- Pay only for what you use
- Industry standard
- Can add CDN for speed

---

## 📝 **Summary**

Think of it like a restaurant:
- **Supabase** = The menu and inventory list (what dishes we have)
- **Cloudinary/AWS** = The kitchen/storage (where ingredients are kept)
- **Vercel** = The dining room and waiters (what customers see and interact with)

We're just switching from an expensive kitchen (Cloudinary) to a cheaper one (AWS), but the menu (Supabase) and dining room (Vercel) stay exactly the same!