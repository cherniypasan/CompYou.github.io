// Google Apps Script для CompYou Orders Database
// Сохраните этот код в Google Apps Script (Расширения → Apps Script)

const SHEET_NAME = 'Orders';
const PASSWORD = 'compyou2023'; // Замените на свой пароль для безопасности

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Простая проверка пароля (опционально)
    if (data.password && data.password !== PASSWORD) {
      return createErrorResponse('Неверный пароль');
    }
    
    const action = data.action;
    
    let result;
    
    switch(action) {
      case 'addOrder':
        result = addOrder(data.order);
        break;
      case 'getOrders':
        result = getOrders();
        break;
      case 'updateStatus':
        result = updateOrderStatus(data.orderId, data.status);
        break;
      case 'deleteOrder':
        result = deleteOrder(data.orderId);
        break;
      case 'ping':
        result = { success: true, message: 'CompYou Cloud DB active' };
        break;
      case 'clearAll':
        result = clearAllOrders(data.confirm === true);
        break;
      case 'getStats':
        result = getStats();
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
    
    return createSuccessResponse(result);
      
  } catch (error) {
    return createErrorResponse(error.toString());
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action || 'getOrders';
    
    let result;
    
    switch(action) {
      case 'getOrders':
        result = getOrders();
        break;
      case 'ping':
        result = { success: true, message: 'CompYou Cloud DB active', timestamp: new Date().toISOString() };
        break;
      case 'getStats':
        result = getStats();
        break;
      default:
        result = getOrders();
    }
    
    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error.toString());
  }
}

function addOrder(order) {
  const sheet = getSheet();
  
  // Проверяем, нет ли уже такого заказа
  const existingOrder = findOrderById(order.id);
  if (existingOrder) {
    return { 
      success: false, 
      error: 'Order already exists',
      orderId: order.id 
    };
  }
  
  // Форматируем данные для записи
  const rowData = [
    order.id,
    order.fullName || '',
    order.phone || '',
    order.email || '',
    order.address || '',
    order.orderType || 'custom',
    order.orderDetails || '',
    order.comments || '',
    order.payment || 'cash',
    order.total || 0,
    order.date || new Date().toLocaleString('ru-RU'),
    order.status || 'Новый',
    JSON.stringify(order.items || []),
    order.paymentDetails ? JSON.stringify(order.paymentDetails) : '',
    new Date().toISOString(), // Дата создания
    new Date().toISOString()  // Дата обновления
  ];
  
  sheet.appendRow(rowData);
  
  return { 
    success: true, 
    orderId: order.id,
    message: 'Order saved successfully'
  };
}

function getOrders() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return []; // Только заголовки
  
  const orders = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    try {
      const order = {
        id: Number(row[0]) || 0,
        fullName: row[1] || '',
        phone: row[2] || '',
        email: row[3] || '',
        address: row[4] || '',
        orderType: row[5] || 'custom',
        orderDetails: row[6] || '',
        comments: row[7] || '',
        payment: row[8] || 'cash',
        total: Number(row[9]) || 0,
        date: row[10] || '',
        status: row[11] || 'Новый',
        items: tryParseJSON(row[12]) || [],
        paymentDetails: tryParseJSON(row[13]) || null,
        createdAt: row[14] || '',
        updatedAt: row[15] || ''
      };
      
      // Валидация данных
      if (order.id && order.fullName) {
        orders.push(order);
      }
    } catch (e) {
      console.error('Error parsing row', i, e.toString());
    }
  }
  
  return orders;
}

function updateOrderStatus(orderId, status) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === orderId) {
      // Обновляем статус и дату обновления
      sheet.getRange(i + 1, 12).setValue(status); // Столбец Status
      sheet.getRange(i + 1, 16).setValue(new Date().toISOString()); // UpdatedAt
      return { 
        success: true, 
        orderId: orderId,
        message: 'Status updated'
      };
    }
  }
  
  return { 
    success: false, 
    error: 'Order not found',
    orderId: orderId 
  };
}

function deleteOrder(orderId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === orderId) {
      sheet.deleteRow(i + 1);
      return { 
        success: true, 
        orderId: orderId,
        message: 'Order deleted'
      };
    }
  }
  
  return { 
    success: false, 
    error: 'Order not found',
    orderId: orderId 
  };
}

function clearAllOrders(confirm) {
  if (!confirm) {
    return { 
      success: false, 
      error: 'Confirmation required' 
    };
  }
  
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    return { 
      success: true, 
      message: 'All orders cleared',
      deletedCount: lastRow - 1
    };
  }
  
  return { 
    success: true, 
    message: 'No orders to clear' 
  };
}

function getStats() {
  const orders = getOrders();
  
  const statusCounts = {};
  let totalRevenue = 0;
  
  orders.forEach(order => {
    // Статистика по статусам
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    
    // Общая выручка
    totalRevenue += order.total || 0;
  });
  
  return {
    totalOrders: orders.length,
    totalRevenue: totalRevenue,
    averageOrder: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
    statusCounts: statusCounts,
    lastUpdated: new Date().toISOString()
  };
}

function findOrderById(orderId) {
  const orders = getOrders();
  return orders.find(order => order.id === orderId);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    // Добавляем заголовки
    sheet.appendRow([
      'ID', 'FullName', 'Phone', 'Email', 'Address', 'OrderType', 
      'OrderDetails', 'Comments', 'Payment', 'Total', 'Date', 
      'Status', 'ItemsJSON', 'PaymentDetailsJSON', 'CreatedAt', 'UpdatedAt'
    ]);
    
    // Форматируем заголовки
    const headerRange = sheet.getRange(1, 1, 1, 16);
    headerRange.setBackground('#8a2be2');
    headerRange.setFontColor('white');
    headerRange.setFontWeight('bold');
    
    // Устанавливаем ширину столбцов
    sheet.setColumnWidth(1, 80); // ID
    sheet.setColumnWidth(2, 150); // FullName
    sheet.setColumnWidth(3, 120); // Phone
    sheet.setColumnWidth(4, 180); // Email
    sheet.setColumnWidth(5, 200); // Address
    sheet.setColumnWidth(12, 100); // Status
    
    // Замораживаем заголовок
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

function tryParseJSON(jsonString) {
  try {
    if (!jsonString || jsonString.trim() === '') return null;
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('JSON parse error:', e.toString());
    return null;
  }
}

function createSuccessResponse(data) {
  const response = {
    success: true,
    data: data,
    timestamp: new Date().toISOString()
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(errorMessage) {
  const response = {
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString()
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}