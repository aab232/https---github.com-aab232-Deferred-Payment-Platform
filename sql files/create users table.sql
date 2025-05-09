CREATE TABLE `users` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(255) NOT NULL,
  `surname` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL, -- stores password hash too
  `date_of_birth` DATE NOT NULL,
  `phone_number` VARCHAR(25) DEFAULT NULL,
  `ni_number` VARCHAR(20) NOT NULL, -- national insurance number for identity verification
  `credit_score` INT DEFAULT NULL,
  `is_verified` TINYINT(1) DEFAULT 0, -- checks if user has used MFA to verify their identity
  `buffer_bag_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- current balance in the user buffer bag
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, -- tracks account creation date and time
  `role` ENUM('admin','contractor','data_engineer','customer') DEFAULT 'customer', -- tracks account roles
  `plaid_item_id` VARCHAR(255) NULL DEFAULT NULL, -- Plaid item ID for linked account
  `plaid_access_token` VARCHAR(255) NULL DEFAULT NULL, -- user Plaid access token
  `current_credit_limit` DECIMAL(10, 2) NULL DEFAULT NULL, -- latest credit limit based on assessment
  `monthly_spending_limit` DECIMAL (10,2) NULL DEFAULT NULL, -- user-set credit limit
  `used_credit_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- sum of remaining balances on active BNPL orders
  
  PRIMARY KEY (`user_id`), -- setting primary key
  UNIQUE KEY `idx_email_unique` (`email`) -- email address must be unique
);