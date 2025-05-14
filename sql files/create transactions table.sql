CREATE TABLE `transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `transaction_type` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `transaction_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `transaction_status` VARCHAR(50) NOT NULL DEFAULT 'Pending',
  `description` TEXT NOT NULL,
  `is_buffer_transaction` TINYINT(1) NOT NULL DEFAULT '0', -- is this a buffer bag transaction?
  
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `transactions_ibfk_1` 
	FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
	ON DELETE CASCADE                     
    ON UPDATE CASCADE
  );