CREATE TABLE `buffer_bag` (
  `user_id` INT NOT NULL,
  `balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- current balance in the buffer bag
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- when the bag record was created
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- when the balance was last updated
  
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_buffer_bag_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) 
	  ON DELETE CASCADE 
	  ON UPDATE CASCADE -- link to the user table, cascade delete if user is removed
);