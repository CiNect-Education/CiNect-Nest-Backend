import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const FULL_NAME_REGEX = /^[\p{L}\s]+$/u;
const GMAIL_EMAIL_REGEX = /^[A-Za-z0-9]+@gmail\.com$/;
const PHONE_REGEX = /^0\d{9}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export class RegisterDto {
  @ApiProperty({ example: 'username@gmail.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(GMAIL_EMAIL_REGEX, {
    message: 'Email must be in ten@gmail.com format and contain no special characters',
  })
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'Confirm password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Confirm password must include at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  confirmPassword: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 50, { message: 'Full name must be between 2 and 50 characters' })
  @Matches(FULL_NAME_REGEX, {
    message: 'Full name can only contain letters and spaces',
  })
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, {
    message: 'Phone number is invalid. It must start with 0 and contain exactly 10 digits',
  })
  phone: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  city?: string;
}
