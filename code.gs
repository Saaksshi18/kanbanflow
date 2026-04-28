var SHEET_ID = "YOUR_SHEET_ID_HERE";
var SHEET_NAME = "Tasks";


// Column indices (1-based for Sheets API)
var COL = {
  TASK_ID    : 1,  // A
  TITLE      : 2,  // B
  DESCRIPTION: 3,  // C
  STATUS     : 4,  // D
  PRIORITY   : 5,  // E
  ASSIGNEE   : 6,  // F
  COLOR      : 7,  // G
  UPDATED_AT : 8,  // H
  CREATED_AT : 9,  // I
  DUE_DATE   : 10  // J  ← NEW
};


var STATUSES = ["Backlog", "In-Progress", "Done"];


// IST TIMESTAMP HELPER
function getISTTimestamp() {
  var now = new Date();
  var istOffset = 5.5 * 60 * 60 * 1000;
  var istTime   = new Date(now.getTime() + istOffset);
  var dd   = String(istTime.getUTCDate()).padStart(2, "0");
  var mm   = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  var yyyy = istTime.getUTCFullYear();
  var hh   = String(istTime.getUTCHours()).padStart(2, "0");
  var min  = String(istTime.getUTCMinutes()).padStart(2, "0");
  var ss   = String(istTime.getUTCSeconds()).padStart(2, "0");
  return dd + "/" + mm + "/" + yyyy + ", " + hh + ":" + min + ":" + ss + " IST";
}


// ENTRY POINT
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("index")
    .setTitle("KanbanFlow — Collaborative Board")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// SHEET HELPERS
function getSheet() {
  var ss = (SHEET_ID === "YOUR_GOOGLE_SHEET_ID_HERE")
    ? SpreadsheetApp.getActiveSpreadsheet()
    : SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || createSheet(ss);
}


function createSheet(ss) {
  var sheet = ss.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, 10).setValues([[
    "TaskID", "Title", "Description", "Status",
    "Priority", "Assignee", "Color", "UpdatedAt", "CreatedAt", "DueDate"
  ]]);
  sheet.getRange(1, 1, 1, 10)
    .setBackground("#1a1a2e")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.setFrozenRows(1);


  var now = getISTTimestamp();
  var samples = [
    ["TASK-001","Design system architecture","Define tech stack and DB schema","Backlog","High","Alice","#6366f1",now,now,"2025-05-01"],
    ["TASK-002","Set up Google Apps Script","Initialize project and deploy","In-Progress","Medium","Bob","#f59e0b",now,now,""],
    ["TASK-003","Build Kanban UI","Create drag-drop board frontend","In-Progress","High","Carol","#ef4444",now,now,"2025-04-20"],
    ["TASK-004","Write documentation","README and deployment guide","Backlog","Low","","#10b981",now,now,""],
    ["TASK-005","Initial project kickoff","Team meeting and requirements","Done","High","Alice","#8b5cf6",now,now,""]
  ];
  sheet.getRange(2, 1, samples.length, 10).setValues(samples);
  return sheet;
}


function generateTaskId() {
  return "TASK-" + Utilities.getUuid().split("-")[0].toUpperCase();
}


// PUBLIC API


function getTasks() {
  try {
    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return JSON.stringify({ tasks: [], hash: "empty" });


    var tasks = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[COL.TASK_ID - 1]) continue;
      tasks.push({
        id         : row[COL.TASK_ID    - 1],
        title      : row[COL.TITLE      - 1],
        description: row[COL.DESCRIPTION - 1],
        status     : row[COL.STATUS     - 1],
        priority   : row[COL.PRIORITY   - 1],
        assignee   : row[COL.ASSIGNEE   - 1],
        color      : row[COL.COLOR      - 1],
        updatedAt  : row[COL.UPDATED_AT  - 1],
        createdAt  : row[COL.CREATED_AT  - 1],
        dueDate    : row[COL.DUE_DATE   - 1] || ""
      });
    }


    var hash = tasks.map(t => t.id + t.status + t.updatedAt).join("|");
    return JSON.stringify({ tasks: tasks, hash: hash });


  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}


function addTask(title, description, priority, assignee, color, status, dueDate) {
  if (!title || title.trim() === "") {
    return JSON.stringify({ success: false, error: "Title is required" });
  }


  var validStatuses = ["Backlog", "In-Progress", "Done"];
  var initialStatus = (validStatuses.indexOf(status) !== -1) ? status : "Backlog";


  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);


    var sheet = getSheet();
    var now   = getISTTimestamp();
    var id    = generateTaskId();


    sheet.appendRow([
      id,
      title.trim(),
      (description || "").trim(),
      initialStatus,
      priority  || "Medium",
      assignee  || "",
      color     || "#6366f1",
      now,
      now,
      dueDate   || ""
    ]);


    return JSON.stringify({ success: true, taskId: id });


  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}


function updateTask(taskId, newStatus, assignee) {
  if (STATUSES.indexOf(newStatus) === -1) {
    return JSON.stringify({ success: false, error: "Invalid status: " + newStatus });
  }


  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);


    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    var now   = getISTTimestamp();


    for (var i = 1; i < data.length; i++) {
      if (data[i][COL.TASK_ID - 1] === taskId) {
        sheet.getRange(i + 1, COL.STATUS    ).setValue(newStatus);
        sheet.getRange(i + 1, COL.UPDATED_AT).setValue(now);
        if (assignee !== undefined && assignee !== null) {
          sheet.getRange(i + 1, COL.ASSIGNEE).setValue(assignee);
        }
        return JSON.stringify({ success: true, updatedAt: now });
      }
    }


    return JSON.stringify({ success: false, error: "Task not found: " + taskId });


  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}


function deleteTask(taskId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);


    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();


    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][COL.TASK_ID - 1] === taskId) {
        sheet.deleteRow(i + 1);
        return JSON.stringify({ success: true });
      }
    }


    return JSON.stringify({ success: false, error: "Task not found" });


  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}


function editTask(taskId, title, description, priority, assignee, color, dueDate) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);


    var sheet = getSheet();
    var data  = sheet.getDataRange().getValues();
    var now   = getISTTimestamp();


    for (var i = 1; i < data.length; i++) {
      if (data[i][COL.TASK_ID - 1] === taskId) {
        if (title)                    sheet.getRange(i + 1, COL.TITLE      ).setValue(title.trim());
        if (description !== undefined) sheet.getRange(i + 1, COL.DESCRIPTION).setValue(description.trim());
        if (priority)                 sheet.getRange(i + 1, COL.PRIORITY   ).setValue(priority);
        if (assignee !== undefined)   sheet.getRange(i + 1, COL.ASSIGNEE   ).setValue(assignee);
        if (color)                    sheet.getRange(i + 1, COL.COLOR      ).setValue(color);
        if (dueDate !== undefined)    sheet.getRange(i + 1, COL.DUE_DATE   ).setValue(dueDate || "");
        sheet.getRange(i + 1, COL.UPDATED_AT).setValue(now);
        return JSON.stringify({ success: true });
      }
    }


    return JSON.stringify({ success: false, error: "Task not found" });


  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

