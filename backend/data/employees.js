const roles = {
    ADMIN: 'admin',
    USER: 'user',
    INVENTORY_MANAGER: 'inventory_manager',
    INVENTORY_VIEWER: 'inventory-viewer'
};

const permissions = {
    timeTracking: {
        view: ['admin', 'user'],
        edit: ['admin', 'user']
    },
    inventory: {
        view: ['admin', 'inventory-viewer', 'inventory_manager'],
        edit: ['admin', 'inventory_manager'],
        delete: ['admin']
    }
};

const employees = {
    'MA001': {
        id: 'MA001',
        name: 'Max Mustermann',
        passwordHash: '$2a$10$kOn8HDcmTk3iV58IBicqmu.4D6koAnZsIWanCmvVCa.g5L50WJqyS', // test123
        roles: ['user', 'inventory_manager']
    },
    'MA002': {
        id: 'MA002',
        name: 'Anna Schmidt',
        passwordHash: '$2a$10$l3KAfnTZkrL./m8xCLjeQ.GYb02EhIDXsDrVbUeCaqXCqv1aMJAUS', // anna123
        roles: ['user']
    },
    'MA003': {
        id: 'MA003',
        name: 'Lisa Meyer',
        passwordHash: '$2a$10$Mmfo/ciaqQF6xnx2BABCjuBeFnZXEDYgzZBnB6G8T3BBPUse93s1a', // lisa123
        roles: ['admin']
    },
    'MA004': {
        id: 'MA004',
        name: 'Josef Toledo',
        passwordHash: '$2a$10$0wF6cXbQGlbeqzA101HEC.JmAb1vPlW2KmTOwE.mgTFD0uKx2.hwq', // josef123
        roles: ['admin']
    },
    'MA005': {
        id: 'MA005',
        name: 'Doktor Cheerio',
        passwordHash: '$2a$10$ZAQ9OGdMeUElGlBpwjOmy./HUZUsYpAqeXJMlvF6feICGthSHJYD2', // doktor123
        roles: ['admin']
    }
};

function hasPermission(employeeId, permission, action = 'view') {
    const employee = employees[employeeId];
    if (!employee) return false;
    
    const permissionConfig = permissions[permission];
    if (!permissionConfig) return false;
    
    const allowedRoles = permissionConfig[action] || [];
    return employee.roles.some(role => allowedRoles.includes(role));
}

module.exports = { 
    employees, 
    roles, 
    permissions,
    hasPermission 
}; 