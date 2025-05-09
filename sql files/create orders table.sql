CREATE TABLE `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT, -- primary key for the order/loan
  `user_id` INT NOT NULL, -- foreign key linking to the user making the purchase
  `assessment_id` INT NULL, -- foreign key linking to the specific credit assessment used for this order
  `product_title` VARCHAR(255) NOT NULL, -- name/title of purchased product
  `product_price` DECIMAL(10, 2) NOT NULL, -- actual price of the product at time of purchase
  `loan_amnt` INT NOT NULL, -- amount financed via BNPL
  `selected_term_months` INT NOT NULL, -- repayment term length chosen by the user
  `remaining_balance` DECIMAL(10, 2) NOT NULL, -- outstanding amount owed
  `order_status` ENUM(
        'PENDING_COMPLETION', -- initial state after user confirms
        'ACTIVE',             -- loan is active, repayments due
        'PAID_OFF',           -- loan fully repaid
        'DEFAULTED',          -- sser failed to repay
        'CANCELLED'           -- order was cancelled
    ) NOT NULL DEFAULT 'PENDING_COMPLETION',
  `order_timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- when order was placed
  `next_payment_due_date` DATE NULL , -- date the next repayment is due

  PRIMARY KEY (`order_id`), -- setting primary key
  INDEX `idx_order_user_status` (`user_id`, `order_status`), -- fetches user's active loans
  INDEX `idx_order_assessment` (`assessment_id`),

  CONSTRAINT `fk_order_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE RESTRICT, -- prevents deleting user if they have active/pending orders

CONSTRAINT `fk_order_assessment_id`
    FOREIGN KEY (`assessment_id`) REFERENCES `credit_assessments` (`assessment_id`)
    ON DELETE CASCADE                     
    ON UPDATE CASCADE
);